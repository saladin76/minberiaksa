import { subscriptionPaymentSequence } from "@/lib/dashboard/subscription-payment-sequence";
import { loadDonationFinancialSummaries } from "@/lib/dashboard/donation-financial-summary";
import type { Prisma } from "@prisma/client";
import { resolveNewCardPaymentRoute } from "@/lib/donations/payment-routing-server";
import { donorAccountStatus } from "@/lib/dashboard/donor-account";
import { getTrackingClientIp } from "@/lib/tracking/client-ip";
import { donationPaymentEvidence } from "@/lib/donations/payment-evidence";
import { POST as createCartDonation } from "@/app/api/cart/payment/route";
import { isOrderType, isRecurringFrequency } from "@/lib/donations/recurring-schedule";
import { NextRequest, NextResponse } from "next/server";
import { donationProviderWhere } from "@/lib/dashboard/donation-provider-filter";
import { prisma } from "@/lib/prisma";
import { donationStatusWhere } from "@/lib/dashboard/donation-usd-revenue";
import { donationListSafeFields } from "@/lib/dashboard/donation-list-privacy";
import { isValidLocale } from "@/lib/locales";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/options";
import { resolveReferralId } from "@/lib/referral-server";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { isRevenueDashboardUser } from "@/lib/dashboard/api-auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  convertAmountInCurrencyToUsd,
  normalizeDonationCurrencyCode,
} from "@/lib/exchange/convert-amount-in-currency-to-usd";
import {
  countryCodeFromPhone,
  getDonorCountryCodeForSnapshot,
  normalizeDonorCountryCode,
} from "@/lib/donations/donor-country-code";
import { sanitizeDonationAttribution } from "@/lib/attribution/sanitize";
import { inferLocaleFromRequest } from "@/lib/preferred-lang";
import { resolveGuestDonor } from "@/lib/users/resolve-guest-donor";
import { istanbulDateKeysToUtcRange } from "@/lib/admin/istanbul-calendar";
import { mintDonationAccessToken } from "@/lib/donations/access-token";
import {
  donationFrequencyWhere,
  loadSubscriptionFrequencies,
  parseFrequencyParam,
} from "@/lib/dashboard/recurring-frequency-filter";
import {
  campaignWhereForDonationSearch,
  campaignTranslationWhereForDonationSearch,
  categoryWhereForDonationSearch,
  categoryTranslationWhereForDonationSearch,
  donationWhereForIds,
  donationWhereForDonorSearch,
  userWhereForDonorSearch,
} from "@/lib/dashboard/donation-search";
import { resolveDonationRelationFilterIds } from "@/lib/dashboard/donation-relation-filters";
import { accountingDateWhere, canUseAccountingDate } from "@/lib/dashboard/accounting-date-where";
import { dashboardLocaleWhere, dashboardCountryWhere } from "@/lib/dashboard/donation-location-scope";
import { dashboardDonationDateSortField } from "@/lib/dashboard/donation-ledger-date";

// GET /api/donations - Get all donations (admin) or user's donations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const userId = searchParams.get("userId");
    const categoryId = searchParams.get("categoryId");
    const referralId = searchParams.get("referralId");
    const search = searchParams.get("search")?.trim();
    const startParam = searchParams.get("start"); // YYYY-MM-DD
    const endParam = searchParams.get("end"); // YYYY-MM-DD
    const sortBy = searchParams.get("sortBy") === "amount" ? "amount" : "date";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const requestedPage = Number.parseInt(searchParams.get("page") || "1", 10);
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "10", 10);
    // Never pass negative or NaN skip/take into Prisma, including on legacy views.
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 10;
    const validPage = Number.isSafeInteger(requestedPage) && requestedPage > 0
      && Number.isSafeInteger((requestedPage - 1) * limit);
    const page = validPage ? requestedPage : 1;
    const skip = (page - 1) * limit;

    // Dashboard sends YYYY-MM-DD keys in the Istanbul calendar  interpret
    // both ends as Istanbul day boundaries so the donations list agrees with
    // the chart/stats (UTC midnight was clipping 3 hours off every day).
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startParam && endParam) {
      const r = istanbulDateKeysToUtcRange(startParam, endParam);
      dateFilter.gte = r.startDate;
      dateFilter.lte = r.endDate;
    } else if (startParam) {
      dateFilter.gte = istanbulDateKeysToUtcRange(startParam, startParam).startDate;
    } else if (endParam) {
      dateFilter.lte = istanbulDateKeysToUtcRange(endParam, endParam).endDate;
    }

    const isAdmin = isRevenueDashboardUser(session);
    const recurringStaff = !isAdmin && userHasDashboardPermission(session.user, "monthly");
    const dashboardReader = isAdmin || recurringStaff;
    const subscriptionOnly =
      dashboardReader &&
      (searchParams.get("subscriptionOnly") === "true" || searchParams.get("subscriptionOnly") === "1");
    if (recurringStaff && !subscriptionOnly) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const donationTypeFilter = isAdmin ? searchParams.get("donationType") : null;
    const statusFilter = dashboardReader ? searchParams.get("status") : null;
    const localeFilter = dashboardReader ? searchParams.get("locale")?.trim() : null;
    const countryFilter = dashboardReader ? searchParams.get("country")?.trim() : null;
    // Recurring cadence of the plan behind the charge (DAILY | FRIDAY | MONTHLY)  implies
    // subscription-only, since a one-time gift has no plan.
    const frequencyFilter = dashboardReader ? parseFrequencyParam(searchParams.get("frequency")) : null;

    // Explicit opt-in only: existing donor and admin listing clients still
    // filter by creation date. The dashboard's settled-date view follows the
    // chart's paidAt/createdAt financial calendar, and requires revenue access.
    const useAccountingDate = canUseAccountingDate({
      revenueAuthorized: isAdmin,
      dateBasis: searchParams.get("dateBasis"),
      start: startParam,
      end: endParam,
    });
    const accountingWhere = useAccountingDate
      ? accountingDateWhere(
          statusFilter,
          dateFilter.gte as Date,
          dateFilter.lte as Date
        )
      : null;

    const baseWhere: Record<string, unknown> = {
      ...(userId && { donorId: userId }),
      ...(referralId && isAdmin && { referralId }),
      ...(subscriptionOnly && { subscriptionId: { not: null } }),
      ...(donationTypeFilter === "MONTHLY" && { subscriptionId: { not: null } }),
      ...(!dashboardReader && { donorId: session.user.id }),
      ...(!useAccountingDate && Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    };

    // Resolve project/category links using their scalar ObjectId columns first.
    // This keeps the main donation query on Donation fields and avoids a slow
    // nested relation traversal on the high-volume dashboard listing.
    const relatedFilters: Record<string, unknown>[] = [];
    const relationIds = await resolveDonationRelationFilterIds({
      campaignId,
      categoryId: dashboardReader ? categoryId : null,
    });
    if (campaignId && campaignId !== "all") {
      const donationIds = relationIds.campaignDonationIds ?? [];
      relatedFilters.push(donationWhereForIds(donationIds));
    }

    if (categoryId && categoryId !== "all" && isAdmin) {
      relatedFilters.push(donationWhereForIds(relationIds.categoryDonationIds ?? []));
    }

    // Search donor/project/category fields in their owning collections first,
    // then join back through scalar IDs. The old mixed OR also applied
    // `contains` to the ObjectId-backed donation id, which made every non-empty
    // search fail on MongoDB.
    let searchWhere: Record<string, unknown> | null = null;
    if (search && isAdmin) {
      const [
        matchingDonors,
        matchingDonations,
        matchingCampaigns,
        matchingCampaignTranslations,
        matchingCategories,
        matchingCategoryTranslations,
      ] = await Promise.all([
        prisma.user.findMany({
          where: userWhereForDonorSearch(search),
          select: { id: true },
        }),
        prisma.donation.findMany({
          where: { providerOrderId: { contains: search, mode: "insensitive" } },
          select: { id: true },
        }),
        prisma.campaign.findMany({
          where: campaignWhereForDonationSearch(search),
          select: { id: true },
        }),
        prisma.campaignTranslation.findMany({
          where: campaignTranslationWhereForDonationSearch(search),
          select: { campaignId: true },
        }),
        prisma.category.findMany({
          where: categoryWhereForDonationSearch(search),
          select: { id: true },
        }),
        prisma.categoryTranslation.findMany({
          where: categoryTranslationWhereForDonationSearch(search),
          select: { categoryId: true },
        }),
      ]);
      const donorIds = matchingDonors.map(({ id }) => id);
      const campaignIds = [...new Set([
        ...matchingCampaigns.map(({ id }) => id),
        ...matchingCampaignTranslations.map(({ campaignId }) => campaignId),
      ])];
      const categoryIds = [...new Set([
        ...matchingCategories.map(({ id }) => id),
        ...matchingCategoryTranslations.map(({ categoryId }) => categoryId),
      ])];
      const [campaignDonationLinks, categoryDonationLinks] = await Promise.all([
        campaignIds.length > 0
          ? prisma.donationItem.findMany({
              where: { campaignId: { in: campaignIds } },
              select: { donationId: true },
            })
          : Promise.resolve([]),
        categoryIds.length > 0
          ? prisma.donationCategoryItem.findMany({
              where: { categoryId: { in: categoryIds } },
              select: { donationId: true },
            })
          : Promise.resolve([]),
      ]);
      const matchingDonationIds = [
        ...new Set([
          ...matchingDonations.map(({ id }) => id),
          ...campaignDonationLinks.map(({ donationId }) => donationId),
          ...categoryDonationLinks.map(({ donationId }) => donationId),
          ...(/^[a-f0-9]{24}$/i.test(search) ? [search] : []),
        ]),
      ];
      if (donorIds.length === 0 && matchingDonationIds.length === 0) {
        return NextResponse.json({
          donations: [],
          pagination: { total: 0, pages: 0, page, limit },
        });
      }
      searchWhere = donationWhereForDonorSearch(donorIds, matchingDonationIds);
    }

    const localeWhere = dashboardLocaleWhere(localeFilter);
    const countryWhere = dashboardCountryWhere(countryFilter);

    // ONE_TIME means "no subscriptionId". MongoDB may store it as null or
    // omit the field entirely; cover both with isSet:false || null.
    const donationTypeWhere =
      donationTypeFilter === "ONE_TIME"
        ? { OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }] }
        : null;

    const frequencyWhere = donationFrequencyWhere(frequencyFilter);

    // ناجح / قيد التأكيد / فاشل, as the tables show them.
    const statusWhere = donationStatusWhere(statusFilter);

    const providerWhere = isAdmin ? donationProviderWhere(searchParams.get("provider")) : null;
    const extraFilters = [...relatedFilters, searchWhere, localeWhere, countryWhere, donationTypeWhere, frequencyWhere, statusWhere, providerWhere, accountingWhere].filter(
      (w) => w != null
    );
    const where: Record<string, unknown> =
      extraFilters.length > 0 ? { AND: [baseWhere, ...extraFilters] } : baseWhere;

    const dateSortField = dashboardDonationDateSortField(
      useAccountingDate ? "accounting" : null,
      statusFilter,
      sortBy
    );
    // The revenue accounting view is paged while reconciling chart totals.
    // When many donations share paidAt/createdAt (or amount), a stable _id
    // tie-breaker prevents duplicate/omitted records between adjacent pages.
    // Keep legacy list orderBy shape unchanged for existing callers.
    const primaryOrder: Prisma.DonationOrderByWithRelationInput =
      { [dateSortField]: sortOrder };
    const orderBy: Prisma.DonationOrderByWithRelationInput | Prisma.DonationOrderByWithRelationInput[] =
      useAccountingDate ? [primaryOrder, { id: sortOrder }] : primaryOrder;

    const total = await prisma.donation.count({ where });
    const donations = await prisma.donation.findMany({
      where,
      // Defense in depth: don't fetch bearer receipt keys, card payloads or
      // private reconciliation state at all. providerRaw is retained server-
      // side ONLY to derive securityMode, and stripped before serialization.
      omit: {
        accessToken: true, cardDetails: true,
        originalDonorId: true, providerAuthCode: true, providerHostRefNum: true,
        paypalOrderId: true, paypalCaptureId: true,
        bankOperations: true, bankOperationLock: true,
        bankOperationsRevision: true, bankLastInquiry: true,
        reconciliationLeaseToken: true, reconciliationLeaseUntil: true,
        reconciliationNextAt: true, reconciliationCheckedAt: true,
        // Attribution and conversion timestamps remain server-side input for
        // the revenue team's source badge. The serializer strips them for
        // donors and sanitizes legacy snapshots for revenue readers.
      },
      include: {
        donor: { select: { id: true, name: true, email: true, image: true, password: true, verifiedAt: true, registeredAt: true, emailVerified: true, _count: { select: { accounts: true } } } },
        items: { include: { campaign: { select: { id: true, title: true, images: true } } } },
        categoryItems: { include: { category: { select: { id: true, name: true } } } },
        comments: { orderBy: { createdAt: "desc" }, take: 1 },
        referral: { select: { id: true, code: true, name: true } },
      },
      orderBy,
      skip,
      take: limit,
    });
    // Subscription payment sequence: is this row the signup charge or the Nth
    // automatic renewal? Stripe's `billingReason` is authoritative when present;
    // for legacy rows we fall back to the row's position within its subscription.
    // Ranked over the whole subscription (not just this page) so paging can't
    // change a donation's cycle number.
    const pageSubscriptionIds = [
      ...new Set(donations.map((d) => d.subscriptionId).filter(Boolean) as string[]),
    ];
    const siblings = pageSubscriptionIds.length ? await prisma.donation.findMany({
      where: { subscriptionId: { in: pageSubscriptionIds } },
      select: { id: true, subscriptionId: true, status: true, paidAt: true, createdAt: true, billingReason: true, providerTxnType: true },
    }) : [];
    const sequenceById = subscriptionPaymentSequence(siblings);
    const financialById = await loadDonationFinancialSummaries(prisma, donations.filter(row => ["ALBARAKA", "PAYFOR"].includes(row.provider || "")).map(row => row.id));

    // `type` stays MONTHLY for every plan charge (older screens key off it); `frequency` is the
    // plan's real cadence.
    const frequencyOf = await loadSubscriptionFrequencies(prisma, pageSubscriptionIds);

    const formattedDonations = donations.map((donation) => ({
      // Compute derived gateway evidence from the complete server-side row,
      // then serialize only the donor-visible subset; never expose bearer
      // receipt tokens, raw provider responses, stored card payloads or locks.
      ...donationListSafeFields(donation, { revenueAuthorized: isAdmin }),
      securityMode: donationPaymentEvidence(donation).securityMode,
      type: donation.subscriptionId ? ("MONTHLY" as const) : ("ONE_TIME" as const),
      frequency: donation.subscriptionId ? frequencyOf(donation.subscriptionId) : null,
      subscriptionCycle: sequenceById.get(donation.id)?.subscriptionCycle ?? null,
      renewalNumber: sequenceById.get(donation.id)?.renewalNumber ?? null,
      testCycle: sequenceById.get(donation.id)?.testCycle ?? null,
      isRecurringCharge: sequenceById.get(donation.id)?.isRecurringCharge ?? donationPaymentEvidence(donation).isRecurringCharge,
      financialSummary: financialById.get(donation.id) ?? null,
      fees: donation.fees,
      teamSupport: donation.teamSupport,
      // Legacy rows can have paymentMethod unset in MongoDB even though every
      // current create path sets CARD or PAYPAL. Default to CARD on read so
      // table cells / receipts never render blank.
      paymentMethod: donation.paymentMethod ?? "CARD",
      donor: { id: donation.donor.id, name: donation.donor.name, email: donation.donor.email, image: donation.donor.image, accountStatus: donorAccountStatus(donation.donor) },
      campaigns: donation.items.map((item) => ({ id: item.campaign.id, title: item.campaign.title, images: item.campaign.images })),
      categories: (donation.categoryItems ?? []).map((ci) => ({ id: ci.category.id, name: ci.category.name })),
      referral: donation.referral ? { id: donation.referral.id, code: donation.referral.code, name: donation.referral.name } : null,
    }));
    return NextResponse.json({
      donations: formattedDonations,
      pagination: { total, pages: Math.ceil(total / limit), page, limit },
    });
  } catch (error) {
    console.error("Error fetching donations:", error);
    return NextResponse.json(
      { error: "Failed to fetch donations" },
      { status: 500 }
    );
  }
}

// POST /api/donations - Create a new donation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || !isOrderType(body.type ?? "ONE_TIME")) {
      return NextResponse.json({ error: "Unsupported donation type" }, { status: 400 });
    }
    // Legacy dialogs and the Minbar checkout must create the same provider-linked
    // plan. The old monthly path omitted provider/card linkage and could never renew.
    if (isRecurringFrequency(body.type)) {
      return createCartDonation(new NextRequest(request.url, {
        method: "POST", headers: request.headers, body: JSON.stringify(body),
      }));
    }
    const session = await getServerSession(authOptions);
    const clientIp = getTrackingClientIp(request.headers);
    const userAgent = request.headers.get("user-agent")?.slice(0, 500) || undefined;
    const attribution = sanitizeDonationAttribution({
      ...((body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution)
        ? body.attribution
        : {}) as Record<string, unknown>),
      user_agent: userAgent,
      client_ip: clientIp,
      client_ip_address: undefined,
    });

    const {
      items,
      categoryItems,
      currency,
      teamSupport = 0,
      coverFees = false,
      paymentMethod,
      referralCode,
      referralId: bodyReferralId,
      locale: donationLocale,
      guest,
    } = body;

    const hasCampaignItems = items?.length > 0;
    const hasCategoryItems = categoryItems?.length > 0;

    // Validate: need at least one of items or categoryItems
    if ((!hasCampaignItems && !hasCategoryItems) || !currency || !paymentMethod) {
      return NextResponse.json(
        { error: "Items or categoryItems, currency, and payment method are required" },
        { status: 400 }
      );
    }

    const paymentRoute = await resolveNewCardPaymentRoute(request.headers, { method: paymentMethod, type: "ONE_TIME", currency: normalizeDonationCurrencyCode(currency), phone: body.routingPhone ?? guest?.phone, userId: session?.user?.id });
    if (paymentRoute && body.expectedGateway && body.expectedGateway !== paymentRoute.gateway) return NextResponse.json({ error: "Payment route changed. Please confirm the updated payment method.", code: "PAYMENT_ROUTING_CHANGED", gateway: paymentRoute.gateway }, { status: 409 });

    // Resolve donorId  authenticated user or guest upsert
    let donorId: string;
    let donorName: string | null = null;
    if (session?.user?.id) {
      donorId = session.user.id;
      donorName = session.user.name ?? null;
    } else if (guest) {
      const guestPhone = guest.phone?.trim() || undefined;
      const guestCountry =
        normalizeDonorCountryCode(guest.countryCode) ?? countryCodeFromPhone(guestPhone) ?? undefined;
      const resolved = await resolveGuestDonor(
        prisma,
        {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email,
          phone: guest.phone,
          countryCode: guestCountry ?? null,
          city: guest.city ?? null,
          region: guest.region ?? null,
        },
        { preferredLang: inferLocaleFromRequest(request, donationLocale) ?? null }
      );
      donorId = resolved.donorId;
      donorName = resolved.donorName;
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const donorCountrySnapshot =
      session?.user?.id
        ? (await getDonorCountryCodeForSnapshot(prisma, donorId)) ?? undefined
        : normalizeDonorCountryCode(guest?.countryCode) ??
          countryCodeFromPhone(guest?.phone) ??
          ((await getDonorCountryCodeForSnapshot(prisma, donorId)) ?? undefined);

    // Card payments are handled via PayFor 3D Secure redirect flow (we do not store PAN/CVV).

    // Calculate totals from both items and categoryItems
    const campaignTotal = hasCampaignItems ? items.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0) : 0;
    const categoryTotal = hasCategoryItems ? categoryItems.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0) : 0;
    const totalAmount = campaignTotal + categoryTotal;
    const fees = (totalAmount + teamSupport) * 0.03;
    const finalTotalAmount = totalAmount + teamSupport + (coverFees ? fees : 0);

    const currencyNorm = normalizeDonationCurrencyCode(currency);
    let donationTotalUsd: number;
    try {
      donationTotalUsd = await convertAmountInCurrencyToUsd(finalTotalAmount, currencyNorm);
    } catch (e) {
      console.error("convertAmountInCurrencyToUsd (donation total):", e);
      return NextResponse.json(
        { error: "Exchange rate unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    type CampaignItemIn = {
      campaignId: string;
      amount: number;
      amountUSD?: number;
      shareCount?: number;
    };
    type CategoryItemIn = { categoryId: string; amount: number; amountUSD?: number };

    let campaignItemsResolved: Array<{
      campaignId: string;
      amount: number;
      amountUSD: number;
      shareCount?: number;
    }> = [];
    let categoryItemsResolved: Array<{ categoryId: string; amount: number; amountUSD: number }> = [];

    try {
      if (hasCampaignItems) {
        campaignItemsResolved = await Promise.all(
          (items as CampaignItemIn[]).map(async (item) => ({
            campaignId: item.campaignId,
            amount: item.amount,
            amountUSD: await convertAmountInCurrencyToUsd(item.amount, currencyNorm),
            ...(item.shareCount != null && item.shareCount > 0
              ? { shareCount: Math.floor(item.shareCount) }
              : {}),
          }))
        );
      }
      if (hasCategoryItems) {
        categoryItemsResolved = await Promise.all(
          (categoryItems as CategoryItemIn[]).map(async (item) => ({
            categoryId: item.categoryId,
            amount: item.amount,
            amountUSD: await convertAmountInCurrencyToUsd(item.amount, currencyNorm),
          }))
        );
      }
    } catch (e) {
      console.error("convertAmountInCurrencyToUsd (line items):", e);
      return NextResponse.json(
        { error: "Exchange rate unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    // Verify all campaigns exist and are active (if any)
    if (hasCampaignItems) {
      const campaignIds = items.map((item: { campaignId: string }) => item.campaignId);
      const campaigns = await prisma.campaign.findMany({
        where: { id: { in: campaignIds } },
      });
      if (campaigns.length !== items.length) {
        return NextResponse.json(
          { error: "One or more campaigns not found" },
          { status: 404 }
        );
      }
      if (campaigns.some((c) => !c.isActive)) {
        return NextResponse.json(
          { error: "One or more campaigns are not active" },
          { status: 400 }
        );
      }
    }

    // Verify all categories exist (if any)
    if (hasCategoryItems) {
      const categoryIds = categoryItems.map((item: { categoryId: string }) => item.categoryId);
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
      });
      if (categories.length !== categoryItems.length) {
        return NextResponse.json(
          { error: "One or more categories not found" },
          { status: 404 }
        );
      }
    }

    // Accept either referralId (MongoDB id) or referralCode (string code); validate and use one.
    let referralId: string | null = null;
    if (bodyReferralId && typeof bodyReferralId === "string" && bodyReferralId.trim()) {
      const ref = await prisma.referral.findUnique({
        where: { id: bodyReferralId.trim() },
        select: { id: true },
      });
      referralId = ref?.id ?? null;
    }
    if (referralId == null) {
      referralId = await resolveReferralId(referralCode);
    }

    const validLocale =
      donationLocale && isValidLocale(String(donationLocale).toLowerCase())
        ? String(donationLocale).toLowerCase()
        : null;

    // One-time: create a single Donation (transaction) only
    const donation = await prisma.$transaction(async (tx) => {
      const d = await tx.donation.create({
        data: {
          accessToken: mintDonationAccessToken(),
          amount: totalAmount,
          amountUSD: donationTotalUsd,
          teamSupport,
          coverFees,
          currency: currencyNorm,
          fees: coverFees ? fees : 0,
          totalAmount: finalTotalAmount,
          status: "PAID",
          locale: validLocale ?? undefined,
          attribution: attribution ?? undefined,
          donorCountryCode: donorCountrySnapshot,
          donorId,
          referralId: referralId ?? undefined,
          paymentMethod,
          cardDetails: null,
          ...(paymentRoute ? { provider: paymentRoute.gateway, providerRaw: { paymentRouting: paymentRoute } as unknown as Prisma.InputJsonValue } : {}),
          items: hasCampaignItems
            ? {
                create: campaignItemsResolved.map((item) => ({
                  campaignId: item.campaignId,
                  amount: item.amount,
                  amountUSD: item.amountUSD,
                  ...(item.shareCount != null && item.shareCount > 0
                    ? { shareCount: item.shareCount }
                    : {}),
                })),
              }
            : undefined,
          categoryItems: hasCategoryItems
            ? {
                create: categoryItemsResolved.map((item) => ({
                  categoryId: item.categoryId,
                  amount: item.amount,
                  amountUSD: item.amountUSD,
                })),
              }
            : undefined,
        },
        include: {
          donor: { select: { name: true, email: true } },
          items: { include: { campaign: { select: { title: true } } } },
          categoryItems: { include: { category: { select: { name: true } } } },
        },
      });

      if (validLocale) {
        const donor = await tx.user.findUnique({
          where: { id: donorId },
          select: { preferredLang: true },
        });
        if (donor && donor.preferredLang == null) {
          await tx.user.update({
            where: { id: donorId },
            data: { preferredLang: validLocale },
          });
        }
      }

      return d;
    }, { timeout: 15000 });

    const actorRole = session?.user?.role ?? "DONOR";
    await writeAuditLog({
      actorId: donorId,
      actorName: donorName,
      actorRole,
      action: "DONATION_ONE_TIME_CHECKOUT_START",
      messageAr: `${donorName ?? "متبرع"} بدأ عملية دفع تبرع لمرة واحدة (≈ ${donationTotalUsd.toFixed(0)} USD)`,
      entityType: "Donation",
      entityId: donation.id,
      metadata: { amountUSD: donationTotalUsd, status: "PENDING", provider: paymentRoute?.gateway ?? null },
      stream: "SITE",
    });

    return NextResponse.json({
      success: true,
      donation,
    });
  } catch (error) {
    console.error("Error creating donation:", error);
    return NextResponse.json(
      { error: "Failed to create donation" },
      { status: 500 }
    );
  }
}
