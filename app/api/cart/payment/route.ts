import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/lib/locales";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/options";
import { resolveReferralId } from "@/lib/referral-server";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { inferLocaleFromRequest } from "@/lib/preferred-lang";
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
import { resolveGuestDonor } from "@/lib/users/resolve-guest-donor";
import { createBankTransferClaim } from "@/lib/donations/bank-transfer-claims";
import { BANK_TRANSFER_PROVIDER } from "@/lib/donations/bank-transfer-shared";
import { listBankAccounts } from "@/lib/minbar/cms";
import { getUsdBaseRatesForServer } from "@/lib/exchange/rates-service";
import { WAQF_MAX_COUNT, WAQF_UNIT_PRICE_USD, isWaqfUnitKey } from "@/lib/minbar/waqf";
import {
  consentSnapshotFor,
  frequencyOfOrderType,
  isOrderType,
  nextChargeAt,
  normalizeTimezone,
  railForFrequency,
  scheduleRuleFor,
} from "@/lib/donations/recurring-schedule";
import { parseMainGateway } from "@/lib/payment-gateway";
import { isAlbarakaConfigured, isAlbarakaRecurringEnabled } from "@/lib/albaraka";
import { mintDonationAccessToken } from "@/lib/donations/access-token";
import { giftLineData, parseGiftOrder, type GiftOrderInput } from "@/lib/donations/gift-order";

const PAYMENT_METHODS = new Set(["CARD", "PAYPAL", "BANK_TRANSFER"]);

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const userId = searchParams.get("userId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      ...(userId && { donorId: userId }),
      ...(!userHasDashboardPermission(session.user, "revenue") && {
        donorId: session.user.id,
      }),
      ...(campaignId && { items: { some: { campaignId } } }),
    };

    // Get total count for pagination
    const total = await prisma.donation.count({ where });

    // Get donations with pagination
    const donations = await prisma.donation.findMany({
      where,
      include: {
        donor: {
          select: {
            name: true,
            email: true,
            image: true,
          },
        },
        items: {
          include: {
            campaign: {
              select: {
                title: true,
                images: true,
              },
            },
          },
        },
        comments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    return NextResponse.json({
      donations,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching donations:", error);
    return NextResponse.json(
      { error: "Failed to fetch donations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const body = await request.json();
    const {
      items: itemsIn,
      categoryItems: categoryItemsIn,
      waqfItems: waqfItemsIn,
      currency,
      teamSupport: teamSupportIn = 0,
      /* Recurring basket: false charges the team support once, with the
         first payment, instead of with every instalment (the default). */
      teamSupportRecurring: teamSupportRecurringIn = true,
      coverFees = false,
      type = "ONE_TIME",
      /* The donor's IANA zone, so "Friday" and "the 15th" are their Friday
         and their 15th. Validated below; UTC when absent or invalid. */
      timezone: timezoneIn,
      paymentMethod,
      cardDetails = null,
      referralCode,
      locale: donationLocale,
      guest,
      /* Bank transfer only: which published account the donor was shown, and
         the currency of the IBAN they picked. Snapshotted onto the claim so
         the finance review knows where to look. */
      bankSlug,
      bankCurrency,
    } = body;

    type CartItemIn = {
      campaignId: string;
      amount: number;
      amountUSD?: number;
      shareCount?: number;
      /** Given in someone else's name; validated into `giftsByIndex` below. */
      gift?: unknown;
    };
    type CategoryItemIn = { categoryId: string; amount: number };
    type WaqfItemIn = { unit: "share" | "meter"; count: number; donorName: string; onBehalf: string };

    /* A line gives either to a campaign, to a category as a whole (a category
       page's donation box may target the category itself), or buys waqf units.
       The lists are independent; an order needs at least one line of any kind. */
    const items: CartItemIn[] = Array.isArray(itemsIn) ? itemsIn : [];
    const categoryItems: CategoryItemIn[] = Array.isArray(categoryItemsIn) ? categoryItemsIn : [];
    const waqfItemsRaw: unknown[] = Array.isArray(waqfItemsIn) ? waqfItemsIn : [];

    /* Waqf lines arrive without a price: the unit price is the server's, and
       both names are required because both go on the certificate. */
    const waqfItems: WaqfItemIn[] = [];
    for (const raw of waqfItemsRaw) {
      const line = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
      const count = line && typeof line.count === "number" && Number.isInteger(line.count) ? line.count : NaN;
      const donorName = line && typeof line.donorName === "string" ? line.donorName.trim().slice(0, 120) : "";
      const onBehalf = line && typeof line.onBehalf === "string" ? line.onBehalf.trim().slice(0, 120) : "";
      if (!line || !isWaqfUnitKey(line.unit) || !(count >= 1 && count <= WAQF_MAX_COUNT) || !donorName || !onBehalf) {
        return NextResponse.json({ error: "Every waqf line needs a unit, a count and both names" }, { status: 400 });
      }
      waqfItems.push({ unit: line.unit, count, donorName, onBehalf });
    }

    // Validate required fields
    if ((!items.length && !categoryItems.length && !waqfItems.length) || !currency || !paymentMethod) {
      return NextResponse.json(
        { error: "Items, currency, and payment method are required" },
        { status: 400 }
      );
    }
    if (!PAYMENT_METHODS.has(String(paymentMethod))) {
      return NextResponse.json({ error: "Unsupported payment method" }, { status: 400 });
    }
    /* One type for the whole order: `ONE_TIME`, or the plan's cadence —
       `DAILY | FRIDAY | MONTHLY`, exactly as the donor chose it. Anything else
       is refused rather than coerced; the old code turned every recurring
       choice into MONTHLY (`DEPLOYED_VS_DESIGN_AUDIT.md` § P0.2). */
    if (!isOrderType(type)) {
      return NextResponse.json({ error: "Unsupported donation type" }, { status: 400 });
    }
    const frequency = frequencyOfOrderType(type);
    const timezone = normalizeTimezone(timezoneIn);
    const isBankTransfer = paymentMethod === "BANK_TRANSFER";
    /* A transfer is a one-off act by the donor; nothing can be charged again
       tomorrow, on Friday or next month. The checkout hides the option for a
       recurring basket, and this is the server's half of that rule. */
    if (isBankTransfer && frequency) {
      return NextResponse.json({ error: "Bank transfer cannot be used for a recurring donation" }, { status: 400 });
    }
    const lineOk = (line: { amount: unknown }) =>
      typeof line?.amount === "number" && Number.isFinite(line.amount) && line.amount > 0;
    if (!items.every(lineOk) || !categoryItems.every(lineOk)) {
      return NextResponse.json({ error: "Every line needs a positive amount" }, { status: 400 });
    }

    /* A campaign line may be a gift: the recipient is named and, per channel
       chosen, reachable. Refused as a whole rather than silently dropped —
       the donor was promised the recipient would be told. */
    const giftsByIndex: Array<GiftOrderInput | null> = [];
    for (const item of items) {
      const parsed = parseGiftOrder(item.gift);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      giftsByIndex.push(parsed.gift);
    }

    /* "Support the team" belongs to the order, asked once in the basket. The
       amount is the browser's choice but the switch is the admin's: with the
       step turned off nothing is added whatever the request says. */
    const teamSupportSettings = await prisma.globalSettings.findFirst({
      orderBy: { createdAt: "asc" },
      select: { teamSupportEnabled: true },
    });
    const teamSupportAllowed = teamSupportSettings?.teamSupportEnabled !== false;
    const teamSupport =
      teamSupportAllowed && typeof teamSupportIn === "number" && Number.isFinite(teamSupportIn) && teamSupportIn > 0
        ? Math.round(teamSupportIn * 100) / 100
        : 0;
    /* What each later instalment carries. The first payment (the donation
       created below) always includes the full amount. */
    const planTeamSupport = teamSupportRecurringIn === false ? 0 : teamSupport;

    // Resolve donor
    let donorId: string;
    let donorName: string | null = null;

    if (session?.user?.id) {
      donorId = session.user.id;
      donorName = session.user.name ?? null;
    } else if (guest) {
      const guestPhone = guest.phone || undefined;
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

    /* Waqf lines priced in the order's currency from the USD unit price. The
       rate is the same USD-base table the rest of the site converts with. */
    const currencyForWaqf = normalizeDonationCurrencyCode(currency);
    let waqfResolved: Array<WaqfItemIn & { unitPrice: number; amount: number; amountUSD: number }> = [];
    if (waqfItems.length) {
      let usdRate = 1;
      if (currencyForWaqf !== "USD") {
        try {
          const rates = await getUsdBaseRatesForServer();
          const rate = rates[currencyForWaqf];
          if (!(typeof rate === "number" && rate > 0)) throw new Error(`no rate for ${currencyForWaqf}`);
          usdRate = rate;
        } catch (e) {
          console.error("[cart/payment] waqf pricing rate:", e);
          return NextResponse.json(
            { error: "Exchange rate unavailable. Please try again in a moment." },
            { status: 503 }
          );
        }
      }
      waqfResolved = waqfItems.map((line) => {
        const unitPrice = WAQF_UNIT_PRICE_USD[line.unit];
        const amountUSD = unitPrice * line.count;
        return { ...line, unitPrice, amountUSD, amount: Math.round(amountUSD * usdRate * 100) / 100 };
      });
    }

    // Calculate totals
    const totalAmount = [...items, ...categoryItems, ...waqfResolved].reduce(
      (sum: number, item: { amount: number }) => sum + item.amount,
      0
    );
    const fees = (totalAmount + teamSupport) * 0.03;
    const finalTotalAmount = totalAmount + teamSupport + (coverFees ? fees : 0);

    const currencyNorm = normalizeDonationCurrencyCode(currency);
    let donationTotalUsd: number;
    try {
      donationTotalUsd = await convertAmountInCurrencyToUsd(finalTotalAmount, currencyNorm);
    } catch (e) {
      console.error("[cart/payment] convert total to USD:", e);
      return NextResponse.json(
        { error: "Exchange rate unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    let itemsResolved: Array<{
      campaignId: string;
      amount: number;
      amountUSD: number;
      shareCount?: number;
      gift: GiftOrderInput | null;
    }>;
    let categoryItemsResolved: Array<{ categoryId: string; amount: number; amountUSD: number }>;

    try {
      [itemsResolved, categoryItemsResolved] = await Promise.all([
        Promise.all(
          items.map(async (item, index) => ({
            campaignId: item.campaignId,
            amount: item.amount,
            amountUSD: await convertAmountInCurrencyToUsd(item.amount, currencyNorm),
            ...(item.shareCount != null && item.shareCount > 0
              ? { shareCount: Math.floor(item.shareCount) }
              : {}),
            gift: giftsByIndex[index] ?? null,
          }))
        ),
        Promise.all(
          categoryItems.map(async (item) => ({
            categoryId: item.categoryId,
            amount: item.amount,
            amountUSD: await convertAmountInCurrencyToUsd(item.amount, currencyNorm),
          }))
        ),
      ]);
    } catch (e) {
      console.error("[cart/payment] convert lines to USD:", e);
      return NextResponse.json(
        { error: "Exchange rate unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    // Verify all campaigns exist and are active
    if (items.length) {
      const campaignIds = items.map((item) => item.campaignId);
      const campaigns = await prisma.campaign.findMany({
        where: { id: { in: campaignIds } },
      });

      if (campaigns.length !== items.length) {
        return NextResponse.json(
          { error: "One or more campaigns not found" },
          { status: 404 }
        );
      }

      if (campaigns.some((campaign) => !campaign.isActive)) {
        return NextResponse.json(
          { error: "One or more campaigns are not active" },
          { status: 400 }
        );
      }
    }

    // Verify all categories exist and are not archived (unset isActive is active)
    if (categoryItems.length) {
      const categoryIds = categoryItems.map((item) => item.categoryId);
      if (categoryIds.some((id) => !/^[0-9a-fA-F]{24}$/.test(String(id)))) {
        return NextResponse.json({ error: "One or more categories not found" }, { status: 404 });
      }
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, isActive: true },
      });

      if (categories.length !== categoryItems.length) {
        return NextResponse.json({ error: "One or more categories not found" }, { status: 404 });
      }

      if (categories.some((category) => category.isActive === false)) {
        return NextResponse.json({ error: "One or more categories are not active" }, { status: 400 });
      }
    }

    /* The nested writes for both kinds of line, shared by the three creates
       below; a kind with no lines is left out of the write altogether. */
    const campaignLines = itemsResolved.length
      ? {
          items: {
            create: itemsResolved.map((item) => ({
              campaignId: item.campaignId,
              amount: item.amount,
              amountUSD: item.amountUSD,
              ...(item.shareCount != null && item.shareCount > 0 ? { shareCount: item.shareCount } : {}),
              ...giftLineData(item.gift),
            })),
          },
        }
      : {};
    /* The plan's copy of the lines carries no gift: the recipient is told
       once, off the first (paid) donation, and later instalments are plain. */
    const planCampaignLines = itemsResolved.length
      ? {
          items: {
            create: itemsResolved.map((item) => ({
              campaignId: item.campaignId,
              amount: item.amount,
              amountUSD: item.amountUSD,
              ...(item.shareCount != null && item.shareCount > 0 ? { shareCount: item.shareCount } : {}),
            })),
          },
        }
      : {};
    const categoryLines = categoryItemsResolved.length
      ? {
          categoryItems: {
            create: categoryItemsResolved.map((item) => ({
              categoryId: item.categoryId,
              amount: item.amount,
              amountUSD: item.amountUSD,
            })),
          },
        }
      : {};

    /* Waqf lines on the donation only: they are what the certificates are
       issued for. A recurring waqf plan's later charges are plain donations. */
    const waqfLines = waqfResolved.length
      ? {
          waqfItems: {
            create: waqfResolved.map((line) => ({
              unit: line.unit === "meter" ? ("METER" as const) : ("SHARE" as const),
              count: line.count,
              unitPrice: line.unitPrice,
              amount: line.amount,
              amountUSD: line.amountUSD,
              donorName: line.donorName,
              onBehalf: line.onBehalf,
            })),
          },
        }
      : {};

    const referralId = await resolveReferralId(referralCode);

    const validLocale =
      donationLocale && isValidLocale(String(donationLocale).toLowerCase())
        ? String(donationLocale).toLowerCase()
        : null;

    if (frequency) {
      /* The rail follows the cadence: Stripe keeps one-time + monthly, so a
         monthly plan runs on the main gateway; daily and Friday plans are
         Albaraka's (`railForFrequency`). A plan Albaraka would bill needs the
         scheduler switched on — refusing here is what stops a donor being
         promised a cadence nothing will ever charge. */
      const settings = await prisma.globalSettings.findFirst({
        orderBy: { createdAt: "asc" },
        select: { mainGateway: true },
      });
      const rail = railForFrequency(frequency, parseMainGateway(settings?.mainGateway));
      if (rail === "ALBARAKA" && !(isAlbarakaConfigured() && isAlbarakaRecurringEnabled())) {
        return NextResponse.json(
          { error: "Recurring donations at this frequency are not available at the moment" },
          { status: 400 }
        );
      }

      /* The plan's own clock. `nextBillingDate` is the server's estimate until
         the first paid instalment replaces it; `consentSnapshot` is what the
         donor saw and agreed to, and is never rewritten. */
      const now = new Date();
      const nextBilling = nextChargeAt(frequency, now, timezone);
      const consent = consentSnapshotFor({
        frequency,
        amount: finalTotalAmount,
        currency,
        timezone,
        rail,
        locale: validLocale,
        now,
      });

      const result = await prisma.$transaction(async (tx) => {
        const sub = await tx.subscription.create({
          data: {
            status: "ACTIVE",
            amount: totalAmount,
            amountUSD: donationTotalUsd,
            currency,
            teamSupport: planTeamSupport,
            coverFees,
            paymentMethod,
            cardDetails: paymentMethod === "CARD" ? cardDetails : null,
            donorId: donorId,
            referralId: referralId ?? undefined,
            frequency,
            timezone,
            provider: rail,
            /* Plain data, but Prisma's `InputJsonValue` does not accept a
               named interface without the cast. */
            scheduleRule: scheduleRuleFor(frequency, now, timezone) as unknown as Prisma.InputJsonValue,
            consentSnapshot: consent as unknown as Prisma.InputJsonValue,
            nextBillingDate: nextBilling,
            /* Stamped when the first instalment actually settles — by the
               Stripe webhook or the Albaraka callback — never optimistically. */
            lastBillingDate: null,
            ...planCampaignLines,
            ...categoryLines,
          },
        });

        const donation = await tx.donation.create({
          data: {
            accessToken: mintDonationAccessToken(),
            amount: totalAmount,
            amountUSD: donationTotalUsd,
            teamSupport,
            coverFees,
            currency,
            fees: coverFees ? fees : 0,
            totalAmount: finalTotalAmount,
            status: "PAID",
            locale: validLocale ?? undefined,
            donorCountryCode: donorCountrySnapshot,
            donorId: donorId,
            referralId: referralId ?? undefined,
            subscriptionId: sub.id,
            paymentMethod,
            cardDetails: null,
            ...campaignLines,
            ...categoryLines,
            ...waqfLines,
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

      const d = result.donation;
      const actorRole = session?.user?.role ?? "DONOR";
      await writeAuditLog({
        actorId: donorId,
        actorName: donorName,
        actorRole,
        action: "DONATION_RECURRING_CHECKOUT_START",
        messageAr: `${donorName ?? "متبرع"} بدأ عملية دفع تبرعًا ${frequency === "DAILY" ? "يوميًا" : frequency === "FRIDAY" ? "كل جمعة" : "شهريًا"} عبر السلة (≈ ${donationTotalUsd.toFixed(0)} USD لكل دورة)`,
        entityType: "Donation",
        entityId: d.id,
        metadata: { amountUSD: donationTotalUsd, via: "cart_payment", status: "PENDING", provider: "STRIPE", frequency, timezone, nextChargeAt: consent.nextChargeAt },
        stream: auditStreamForRole(actorRole),
      });

      return NextResponse.json({
        success: true,
        subscription: result.subscription,
        donation: result.donation,
      });
    }

    /* The bank account the donor was shown, resolved server-side so the name
       on the claim is the published one and not whatever the browser sent. */
    let bankSnapshot: { slug: string; name: string } | null = null;
    if (isBankTransfer && typeof bankSlug === "string" && bankSlug.trim()) {
      const accounts = await listBankAccounts(validLocale ?? "ar").catch(() => []);
      const match = accounts.find((account) => account.slug === bankSlug.trim());
      if (match) bankSnapshot = { slug: match.slug, name: match.name };
    }

    const donation = await prisma.$transaction(async (tx) => {
      const d = await tx.donation.create({
        data: {
          accessToken: mintDonationAccessToken(),
          amount: totalAmount,
          amountUSD: donationTotalUsd,
          teamSupport,
          coverFees,
          currency,
          fees: coverFees ? fees : 0,
          totalAmount: finalTotalAmount,
          /* PAID with no paidAt is the site's "قيد التأكيد" state. A card
             order is stamped by the gateway's webhook; a bank transfer by a
             finance officer from the dashboard. Neither counts anywhere before. */
          status: "PAID",
          locale: validLocale ?? undefined,
          donorCountryCode: donorCountrySnapshot,
          donorId: donorId,
          referralId: referralId ?? undefined,
          paymentMethod,
          cardDetails: null,
          ...(isBankTransfer
            ? { provider: BANK_TRANSFER_PROVIDER, providerTxnResult: "Pending" }
            : {}),
          ...campaignLines,
          ...categoryLines,
          ...waqfLines,
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

      const claim = isBankTransfer
        ? await createBankTransferClaim(tx, {
            donationId: d.id,
            bankSlug: bankSnapshot?.slug ?? null,
            bankName: bankSnapshot?.name ?? null,
            bankCurrency: typeof bankCurrency === "string" ? bankCurrency : null,
          })
        : null;

      return { ...d, claim };
    }, { timeout: 15000 });

    const { claim, ...donationRow } = donation;
    const actorRole = session?.user?.role ?? "DONOR";
    await writeAuditLog({
      actorId: donorId,
      actorName: donorName,
      actorRole,
      action: isBankTransfer ? "DONATION_BANK_TRANSFER_CHECKOUT_START" : "DONATION_ONE_TIME_CHECKOUT_START",
      messageAr: isBankTransfer
        ? `${donorName ?? "متبرع"} سجّل تبرعًا بالتحويل البنكي عبر السلة (≈ ${donationTotalUsd.toFixed(0)} USD) — بانتظار الإيصال`
        : `${donorName ?? "متبرع"} بدأ عملية دفع تبرعًا لمرة واحدة عبر السلة (≈ ${donationTotalUsd.toFixed(0)} USD)`,
      entityType: "Donation",
      entityId: donationRow.id,
      metadata: { amountUSD: donationTotalUsd, via: "cart_payment", status: "PENDING", provider: isBankTransfer ? BANK_TRANSFER_PROVIDER : "PAYFOR" },
      stream: auditStreamForRole(actorRole),
    });

    return NextResponse.json({
      success: true,
      donation: donationRow,
      /* The guest's key to the upload page; a signed-in owner does not need
         it but is handed it all the same, which keeps the redirect uniform. */
      ...(claim ? { bankTransfer: { accessToken: claim.accessToken } } : {}),
    });
  } catch (error) {
    console.error("Error creating donation:", error);
    return NextResponse.json(
      { error: "Failed to create donation" },
      { status: 500 }
    );
  }
}
