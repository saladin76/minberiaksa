import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/lib/locales";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/options";
import { resolveReferralId } from "@/lib/referral-server";
import { isRevenueDashboardUser } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditStreamForRole } from "@/lib/audit-log";
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
    const sortBy = (searchParams.get("sortBy") || "date") as "date" | "amount";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "10") || 10, 100);
    const skip = (page - 1) * limit;

    // Dashboard sends YYYY-MM-DD keys in the Istanbul calendar — interpret
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
    const subscriptionOnly =
      isAdmin &&
      (searchParams.get("subscriptionOnly") === "true" || searchParams.get("subscriptionOnly") === "1");
    const donationTypeFilter = isAdmin ? searchParams.get("donationType") : null;
    const statusFilter = isAdmin ? searchParams.get("status") : null;
    const localeFilter = isAdmin ? searchParams.get("locale")?.trim() : null;
    const countryFilter = isAdmin ? searchParams.get("country")?.trim() : null;

    const baseWhere: Record<string, unknown> = {
      ...(campaignId && { items: { some: { campaignId } } }),
      ...(userId && { donorId: userId }),
      ...(referralId && isAdmin && { referralId }),
      ...(subscriptionOnly && { subscriptionId: { not: null } }),
      ...(donationTypeFilter === "MONTHLY" && { subscriptionId: { not: null } }),
      ...(!isAdmin && { donorId: session.user.id }),
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      ...(statusFilter && ["PAID", "FAILED"].includes(statusFilter) && { status: statusFilter }),
    };
    if (categoryId && isAdmin) {
      baseWhere.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }

    // Free-text donor search (name OR email), admin-only. Kept OUT of `baseWhere`
    // and AND-composed below because `baseWhere.OR` is already taken by the
    // category filter — putting a second OR there would silently overwrite it.
    const searchWhere =
      search && isAdmin
        ? {
            donor: {
              is: {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { email: { contains: search, mode: "insensitive" as const } },
                ],
              },
            },
          }
        : null;

    const localeWhere =
      localeFilter && localeFilter !== "all"
        ? localeFilter === "__unset"
          ? { OR: [{ locale: null }, { locale: "" }] }
          : { locale: localeFilter }
        : null;

    const countryWhere =
      countryFilter && countryFilter !== "all"
        ? countryFilter === "__unset"
          ? { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }] }
          : { donorCountryCode: countryFilter.toUpperCase() }
        : null;

    // ONE_TIME means "no subscriptionId". MongoDB may store it as null or
    // omit the field entirely; cover both with isSet:false || null.
    const donationTypeWhere =
      donationTypeFilter === "ONE_TIME"
        ? { OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }] }
        : null;

    const extraFilters = [searchWhere, localeWhere, countryWhere, donationTypeWhere].filter((w) => w != null);
    const where: Record<string, unknown> =
      extraFilters.length > 0 ? { AND: [baseWhere, ...extraFilters] } : baseWhere;

    const orderBy =
      sortBy === "amount"
        ? { amountUSD: sortOrder }
        : { createdAt: sortOrder };

    const total = await prisma.donation.count({ where });
    const donations = await prisma.donation.findMany({
      where,
      include: {
        donor: { select: { id: true, name: true, email: true, image: true } },
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
    const cycleById = new Map<string, number>();
    if (pageSubscriptionIds.length > 0) {
      const siblings = await prisma.donation.findMany({
        where: { subscriptionId: { in: pageSubscriptionIds }, status: "PAID" },
        select: { id: true, subscriptionId: true, paidAt: true, createdAt: true },
      });
      const bySubscription = new Map<string, typeof siblings>();
      for (const row of siblings) {
        const key = row.subscriptionId!;
        const list = bySubscription.get(key) ?? [];
        list.push(row);
        bySubscription.set(key, list);
      }
      for (const list of bySubscription.values()) {
        list
          .sort(
            (a, b) =>
              (a.paidAt ?? a.createdAt).getTime() - (b.paidAt ?? b.createdAt).getTime()
          )
          .forEach((row, index) => cycleById.set(row.id, index + 1));
      }
    }

    const formattedDonations = donations.map((donation) => ({
      ...donation,
      type: donation.subscriptionId ? ("MONTHLY" as const) : ("ONE_TIME" as const),
      subscriptionCycle: donation.subscriptionId ? cycleById.get(donation.id) ?? null : null,
      isRecurringCharge: donation.subscriptionId
        ? donation.billingReason
          ? donation.billingReason !== "subscription_create"
          : (cycleById.get(donation.id) ?? 1) > 1
        : false,
      fees: donation.fees,
      teamSupport: donation.teamSupport,
      // Legacy rows can have paymentMethod unset in MongoDB even though every
      // current create path sets CARD or PAYPAL. Default to CARD on read so
      // table cells / receipts never render blank.
      paymentMethod: donation.paymentMethod ?? "CARD",
      donor: donation.donor,
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
    const session = await getServerSession(authOptions);

    const body = await request.json();
    const forwardedFor = request.headers.get("x-forwarded-for");
    const clientIp =
      forwardedFor?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent")?.slice(0, 500) || undefined;
    const attribution = sanitizeDonationAttribution({
      ...((body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution)
        ? body.attribution
        : {}) as Record<string, unknown>),
      ...(userAgent ? { user_agent: userAgent } : {}),
      ...(clientIp ? { client_ip: clientIp } : {}),
    });

    const {
      items,
      categoryItems,
      currency,
      teamSupport = 0,
      coverFees = false,
      type = "ONE_TIME",
      paymentMethod,
      cardDetails = null,
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

    // Resolve donorId — authenticated user or guest upsert
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

    if (type === "MONTHLY") {
      // Monthly: create Subscription + first Donation (transaction) linked to it.
      // The Stripe invoice.payment_succeeded webhook drives nextBillingDate thereafter;
      // seed it with one month from now so cron filters don't pick the sub up before
      // Stripe has confirmed the first charge.
      const subscription = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const nextBilling = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()));
        nextBilling.setUTCHours(0, 0, 0, 0);

        const sub = await tx.subscription.create({
          data: {
            status: "ACTIVE",
            amount: totalAmount,
            amountUSD: donationTotalUsd,
            currency,
            teamSupport,
            coverFees,
            paymentMethod,
            cardDetails: paymentMethod === "CARD" ? cardDetails : null,
            donorId,
            referralId: referralId ?? undefined,
            nextBillingDate: nextBilling,
            lastBillingDate: new Date(),
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
          include: { items: true, categoryItems: true },
        });

        const donation = await tx.donation.create({
          data: {
            amount: totalAmount,
            amountUSD: donationTotalUsd,
            teamSupport,
            coverFees,
            currency,
            fees: coverFees ? fees : 0,
            totalAmount: finalTotalAmount,
            status: "PAID",
            locale: validLocale ?? undefined,
            attribution: attribution ?? undefined,
            donorCountryCode: donorCountrySnapshot,
            donorId,
            referralId: referralId ?? undefined,
            subscriptionId: sub.id,
            paymentMethod,
            cardDetails: null,
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

        return { subscription: sub, donation };
      }, { timeout: 15000 });

      const d = subscription.donation;
      const actorRole = session?.user?.role ?? "DONOR";
      await writeAuditLog({
        actorId: donorId,
        actorName: donorName,
        actorRole,
        action: "DONATION_MONTHLY_CHECKOUT_START",
        messageAr: `${donorName ?? "متبرع"} بدأ عملية دفع اشتراك شهري (≈ ${donationTotalUsd.toFixed(0)} USD لكل دورة)`,
        entityType: "Donation",
        entityId: d.id,
        metadata: { amountUSD: donationTotalUsd, status: "PENDING", provider: "PAYFOR" },
        stream: auditStreamForRole(actorRole),
      });

      return NextResponse.json({
        success: true,
        subscription: subscription.subscription,
        donation: subscription.donation,
      });
    }

    // One-time: create a single Donation (transaction) only
    const donation = await prisma.$transaction(async (tx) => {
      const d = await tx.donation.create({
        data: {
          amount: totalAmount,
          amountUSD: donationTotalUsd,
          teamSupport,
          coverFees,
          currency,
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
      metadata: { amountUSD: donationTotalUsd, status: "PENDING", provider: "PAYFOR" },
      stream: auditStreamForRole(actorRole),
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