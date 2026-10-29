import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { albarakaCheckoutMode } from "@/lib/donations/albaraka-checkout-mode";
import { bankRequestsAuthentication } from "@/lib/donations/authentication-recovery";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import {
  albaraka2DConfig,
  albaraka2DOrderId,
  albarakaConfig,
  albarakaOrderId,
  buildAlbaraka3DForm,
  albarakaChargeCurrency,
  albarakaCurrencyCode,
  albarakaMinorUnits,
  albarakaService,
  buildAlbaraka2DSale,
  ALBARAKA_MERCHANT_SIDE_CODES,
  albarakaInquireSale,
  isAlbarakaApproved,
  isAlbarakaConfigured,
  isAlbarakaRecurringEnabled,
  isAlbarakaTransportFailure,
  isValidBankExpiry,
  isValidCardNumber,
  type AlbarakaConfig,
  type AlbarakaCurrencyCode,
  type AlbarakaServiceResponse,
} from "@/lib/albaraka";
import { failAlbarakaDonation, settleAlbarakaDonation } from "@/lib/donations/albaraka-settlement";
import { parseMainGateway } from "@/lib/payment-gateway";
import { checkCardAttempt } from "@/lib/security/card-attempts";
import { donationFieldEmpty, donationWhereAll } from "@/lib/donations/mongo-null";
import {
  convertAmountInCurrencyToTry,
  convertAmountInCurrencyToUsd,
  getUsdBaseRatesForServer,
} from "@/lib/exchange/rates-service";
import { normalizeCurrencyCode } from "@/lib/exchange/convert";
import { decryptCard, detectCardType, encryptCard } from "@/lib/card-crypto";

/**
 * POST /api/albaraka/3d/initiate
 *
 * Charges an Albaraka donation in 2D (no 3D Secure): the card goes straight to
 * the bank's /Sale and the answer settles or fails the donation here. The donor
 * is never sent to the bank's 3D page. (The route keeps its path so every
 * checkout keeps calling it; the 3D callback stays for sessions in flight.)
 *
 * The response keeps the shape the checkouts already submit  `{ actionUrl,
 * fields }`  pointing at /api/albaraka/2d/result, which sends the donor to the
 * success or failure page by the donation's real status.
 *
 * The card, one of:
 *   - `savedCardId`  the stored PAN, decrypted here, with the CVC from `card.cvv`
 *     (CVCs are never stored)
 *   - `card`         the donor's freshly-typed card, posted over TLS to this route
 */

type InitiateBody = {
  donationId: string;
  securityMode?: "2D" | "3D";
  locale?: string;
  savedCardId?: string;
  card?: {
    /** PAN, spaces tolerated. */
    number?: string;
    /** "MM/YY" or "MMYY"  the bank wants YYMM, we convert. */
    expiry?: string;
    cvv?: string;
    holder?: string;
  };
};

/** Convert any amount to TRY using USD-base rates from the database (same as donations). */
async function toTRY(amount: number, fromCurrency: string): Promise<number> {
  const rates = await getUsdBaseRatesForServer();
  return convertAmountInCurrencyToTry(amount, fromCurrency, rates);
}

/** Same rates, one step: the table is USD-based, so this is a single division. */
async function toUSD(amount: number, fromCurrency: string): Promise<number> {
  const rates = await getUsdBaseRatesForServer();
  return convertAmountInCurrencyToUsd(amount, fromCurrency, rates);
}

/**
 * The bank wants the expiry as YYMM ("2001" = January 2020). Donors type MM/YY and
 * saved cards are stored MM/YY, so both normalise through here.
 */
function toBankExpiry(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 4) return "";
  const mm = digits.slice(0, 2);
  const yy = digits.slice(2, 4);
  return `${yy}${mm}`;
}

// Room for the sale and an inquiry when its answer is lost.
export const maxDuration = 90;
// Albaraka only accepts calls from the IPs on the terminal's "Sabit IP" list.
// Those are the project's Vercel Static IPs, which exist in ap-southeast-1 only,
// so every route that calls the bank runs there.
export const preferredRegion = "sin1";

/**
 * A /Sale whose answer never arrived. The bank is asked by order id: an
 * approved sale settles the donation, no record fails it. When even that is
 * unclear, keep it pending for half-hour polling. A lost response is not
 * authorization for a new charge or an automatic reversal.
 * Returns whether the donation ended up paid.
 */
async function resolveUnknownOutcome(
  donationId: string,
  orderId: string,
  cfg: AlbarakaConfig,
  cause: unknown
): Promise<boolean> {
  console.error("[Albaraka 2D SALE] no readable answer, inquiring", { donationId, orderId, cause: String(cause) });
  const inquiry = await albarakaInquireSale(orderId, cfg);

  if (inquiry.state === "approved") {
    await settleAlbarakaDonation(
      donationId,
      {
        ServiceResponseData: { ResponseCode: "00", ResponseDescription: "Approved (recovered by status inquiry)" },
        AuthCode: inquiry.authCode,
        ReferenceCode: null,
      },
      { albarakaInquiry: inquiry.raw as unknown as Record<string, unknown> }
    );
    return true;
  }

  await prisma.donation.updateMany({ where: donationWhereAll({ id: donationId, providerOrderId: orderId }, donationFieldEmpty("paidAt")), data: {
    providerTxnResult: "PendingConfirmation", providerErrorMessage: "PAYMENT_CONFIRMATION_PENDING",
    reconciliationNextAt: new Date(Date.now() + 1_800_000),
  } });
  return false;
}

export async function POST(req: NextRequest) {
  /* Set while this request holds the "Processing" claim but has not sent the
     sale yet; an error in that window hands the donation back for a retry. */
  let unsentClaim: string | null = null;
  try {
    const session = await getServerSession(authOptions);

    const body = (await req.json()) as Partial<InitiateBody>;
    const donationId = String(body.donationId || "").trim();
    if (!donationId) {
      return NextResponse.json({ error: "donationId is required" }, { status: 400 });
    }

    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: { subscription: { select: { id: true, frequency: true, provider: true, paymentCardId: true } } },
    });
    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }

    // Server-side belt matching the PayFor kill-switch: the dialogs already gate the
    // UI on the selected main gateway, but a client could still call this directly.
    // A plan is the exception: daily and Friday plans are Albaraka's whatever the
    // main gateway is (`railForFrequency`), provided the scheduler is switched on.
    const settings = await prisma.globalSettings.findFirst({
      orderBy: { createdAt: "asc" },
      select: { mainGateway: true },
    });
    const plan = donation.subscription;
    let mode: "2D" | "3D";
    try { mode = albarakaCheckoutMode(body.securityMode, Boolean(plan)); }
    catch { return NextResponse.json({ error: "Invalid payment verification mode", code: "INVALID_PAYMENT_MODE" }, { status: 400 }); }
    const cfg = mode === "3D" ? albarakaConfig() : albaraka2DConfig();
    if (!isAlbarakaConfigured(cfg)) return NextResponse.json({ error: "Albaraka is not configured on server" }, { status: 503 });
    if (plan) {
      if (plan.provider !== "ALBARAKA" || !isAlbarakaRecurringEnabled()) {
        return NextResponse.json(
          { error: "This recurring plan is not billed by Albaraka." },
          { status: 403 }
        );
      }
    } else if (parseMainGateway(settings?.mainGateway) !== "ALBARAKA") {
      return NextResponse.json(
        { error: "Albaraka is not the selected main gateway." },
        { status: 403 }
      );
    }
    // Authenticated users: verify ownership. Guests have no session  trust the donationId.
    if (session?.user?.id && donation.donorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (donation.status === "FAILED") {
      return NextResponse.json(
        { error: `Donation has already failed (status=${donation.status})` },
        { status: 400 }
      );
    }
    if (donation.paidAt) {
      return NextResponse.json({ error: "Donation already paid" }, { status: 400 });
    }

    // APP_URL keeps OkUrl/ReturnURL on the domain registered with the bank; a bare
    // localhost origin gets the 3D form rejected.
    const origin = paymentPublicOrigin(req.url);
    const locale = (body.locale ?? donation.locale ?? "en").toString().toLowerCase();

    /* The site takes 14 currencies and Albaraka understands three, so something
       always converts. ALBARAKA_CHARGE_CURRENCY decides what to; see
       `albarakaChargeCurrency`. Whichever branch runs, the donation row keeps its
       own currency  this only changes what the bank is asked to charge. */
    // `DEFAULT` (no currency chosen) is USD; see normalizeCurrencyCode.
    const donationCurrency = donation.currency ? normalizeCurrencyCode(donation.currency) : "TRY";
    const policy = albarakaChargeCurrency();

    let chargeAmount: number;
    let currencyCode: AlbarakaCurrencyCode;

    if (policy === "USD") {
      chargeAmount = await toUSD(donation.totalAmount, donation.currency);
      currencyCode = "US";
    } else if (
      policy === "DONOR" &&
      ["TRY", "TL", "USD", "US", "EUR", "EU"].includes(donationCurrency)
    ) {
      chargeAmount = donation.totalAmount;
      currencyCode = albarakaCurrencyCode(donationCurrency);
    } else {
      chargeAmount = await toTRY(donation.totalAmount, donation.currency);
      currencyCode = "TL";
    }

    const amount = albarakaMinorUnits(chargeAmount);
    if (amount <= 0) {
      return NextResponse.json({ error: "Invalid donation amount" }, { status: 400 });
    }

    /* A 2D order is exactly 24 characters, fresh for every attempt (the bank
       refuses an order id it has seen). */
    const orderId = mode === "3D" ? albarakaOrderId() : albaraka2DOrderId();
    const transactionType = "Sale";
    /* Where the browser goes next: the success or failure page, by the
       donation's real status. The access token lets a guest see their receipt. */
    const resultUrl = `${origin}/api/albaraka/2d/result?donationId=${encodeURIComponent(donation.id)}&locale=${encodeURIComponent(
      locale
    )}${donation.accessToken ? `&t=${encodeURIComponent(donation.accessToken)}` : ""}`;

    // ── Card fields ────────────────────────────────────────────────────────────
    let cardNo = "";
    let expiredDate = "";
    let cvv = "";
    let cardHolderName = "";

    const savedCardId = body.savedCardId?.trim();
    if (savedCardId) {
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Authentication required for saved cards" },
          { status: 401 }
        );
      }
      const savedCard = await prisma.creditCard.findUnique({
        where: { id: savedCardId },
        select: {
          userId: true,
          cardNumber: true,
          expiryDate: true,
          cardholderName: true,
        },
      });
      if (!savedCard || savedCard.userId !== session.user.id) {
        return NextResponse.json({ error: "Saved card not found" }, { status: 404 });
      }
      try {
        cardNo = decryptCard(savedCard.cardNumber).replace(/\D/g, "");
      } catch {
        return NextResponse.json(
          { error: "Failed to decrypt saved card" },
          { status: 500 }
        );
      }
      expiredDate = toBankExpiry(savedCard.expiryDate || "");
      cardHolderName = savedCard.cardholderName ?? "";
      // CVCs are never stored  the donor re-types it for every saved-card charge.
      cvv = String(body.card?.cvv || "").replace(/\D/g, "");
    } else {
      cardNo = String(body.card?.number || "").replace(/\D/g, "");
      expiredDate = toBankExpiry(body.card?.expiry || "");
      cvv = String(body.card?.cvv || "").replace(/\D/g, "");
      cardHolderName = String(body.card?.holder || "").trim();
    }

    if (!cardNo || !expiredDate || !cvv) {
      return NextResponse.json(
        { error: "Card number, expiry and security code are required", code: "CARD_REQUIRED" },
        { status: 400 }
      );
    }
    // Caught here rather than spent as a bank decline (and a FAILED donation).
    if (!isValidCardNumber(cardNo)) {
      return NextResponse.json({ error: "Invalid card number", code: "INVALID_CARD_NUMBER" }, { status: 400 });
    }
    if (!isValidBankExpiry(expiredDate)) {
      return NextResponse.json({ error: "Card expiry date is invalid or in the past", code: "INVALID_CARD_EXPIRY" }, { status: 400 });
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      return NextResponse.json({ error: "Invalid security code", code: "INVALID_CARD_CVC" }, { status: 400 });
    }
    // CardInformationData.CardHolderName is max 50 characters.
    cardHolderName = cardHolderName.replace(/\s+/g, " ").slice(0, 50);

    /* Card-testing brakes, before the claim so a refused attempt leaves the
       donation untouched and the donor can retry once the window passes. */
    const attempt = await checkCardAttempt(req.headers, cardNo, "ALBARAKA");
    if (!attempt.ok) {
      console.warn("[Albaraka] card attempt refused", { donationId: donation.id, reason: attempt.reason });
      return NextResponse.json(
        { error: "Too many payment attempts. Please try again later.", code: "TOO_MANY_ATTEMPTS" },
        { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } }
      );
    }

    /* Claim the donation for this attempt, atomically. A double-click or a
       retried request must not send a second /Sale for the same donation: only
       the request that flips it to "Processing" reaches the bank. The flag is
       cleared by settlement ("Success") or failure ("Failed"). */
    const claim = await prisma.donation.updateMany({
      /* `paidAt` is ABSENT, not null, on a fresh checkout row, and on MongoDB
         `{ paidAt: null }` does not match a missing field  so this claim matched
         nothing and EVERY Albaraka card payment was refused as "already in
         progress" before the bank was asked. `donationFieldEmpty` matches both. */
      where: donationWhereAll(
        { id: donation.id, status: { not: "FAILED" } },
        donationFieldEmpty("paidAt"),
        {
          OR: [
            { providerTxnResult: { isSet: false } },
            { providerTxnResult: null },
            { providerTxnResult: { notIn: ["Processing", "Capturing3D", "Rejecting3D"] } },
          ],
        }
      ),
      data: {
        locale,
        provider: "ALBARAKA",
        providerOrderId: orderId,
        providerTxnType: transactionType,
        providerTxnResult: "Processing",
        // Snapshot of what we actually asked the bank to charge.
        providerRaw: {
          ...(typeof donation.providerRaw === "object" && donation.providerRaw ? (donation.providerRaw as object) : {}),
          albarakaRequest: {
            merchantNo: cfg.merchantNo,
            terminalNo: cfg.terminalNo,
            orderId,
            amount,
            currencyCode,
            transactionType,
            mode,
            createdAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });
    if (claim.count !== 1) {
      return NextResponse.json(
        { error: "A payment for this donation is already in progress or finished." },
        { status: 409 }
      );
    }
    unsentClaim = donation.id;
    if (mode === "3D") {
      const fields = buildAlbaraka3DForm({
        orderId, amount, currencyCode, locale,
        returnUrl: `${origin}/api/albaraka/3d/callback?donationId=${encodeURIComponent(donation.id)}&locale=${encodeURIComponent(locale)}`,
        card: { number: cardNo, expireDate: expiredDate, cvc2: cvv, holderName: cardHolderName },
      }, cfg);
      // No Sale here: the bank authenticates first, then the callback claims capture.
      unsentClaim = null;
      return NextResponse.json({ actionUrl: cfg.tdsUrl, fields }, { headers: { "Cache-Control": "no-store" } });
    }

    /* A plan: keep the card the donor is authorising, so the scheduler can
       charge the later instalments. PAN is encrypted at rest; no CVC is stored,
       including hashes. The card is linked before the bank is asked for
       anything, so a plan can never be activated without a card to bill. A
       retry of the same checkout reuses the card already linked. */
    if (plan && !plan.paymentCardId && savedCardId) {
      await prisma.subscription.update({ where: { id: plan.id }, data: { paymentCardId: savedCardId, provider: "ALBARAKA" } });
    } else if (plan && !plan.paymentCardId) {
      const card = await prisma.creditCard.create({
        data: {
          userId: donation.donorId,
          cardNumber: encryptCard(cardNo),
          cardType: detectCardType(cardNo),
          // Stored MM/YY like the rest; the bank's YYMM is derived on each charge.
          expiryDate: `${expiredDate.slice(2, 4)}/${expiredDate.slice(0, 2)}`,
          // PCI DSS 3.3.1: the security code is never kept, not even hashed.
          cvc: "",
          cardholderName: cardHolderName || null,
          nickname: "recurring",
        },
        select: { id: true },
      });
      await prisma.subscription.update({
        where: { id: plan.id },
        data: { paymentCardId: card.id, provider: "ALBARAKA" },
      });
    }

    // ── 2D sale ──────────────────────────────────────────────────────────────
    let sale: AlbarakaServiceResponse | null = null;
    let transportError: unknown = null;
    unsentClaim = null;
    try {
      sale = await albarakaService(
        "Sale",
        buildAlbaraka2DSale(
          {
            orderId,
            amount,
            currencyCode,
            card: { number: cardNo, expireDate: expiredDate, cvc2: cvv, holderName: cardHolderName },
          },
          cfg
        ),
        { correlationId: orderId, config: cfg }
      );
    } catch (err) {
      transportError = err;
    }

    /* The request left but no readable answer came back (timeout, dropped
       connection, an HTML error page). The card may have been charged, so this
       is not a decline: ask the bank, and if it cannot say, leave the order
       pending for scheduled confirmation. */
    if (transportError || isAlbarakaTransportFailure(sale)) {
      const paid = await resolveUnknownOutcome(donation.id, orderId, cfg, transportError ?? sale);
      return NextResponse.json({ actionUrl: resultUrl, fields: {}, paid });
    }

    const approved = isAlbarakaApproved(sale);
    const responseCode = sale?.ServiceResponseData?.ResponseCode ?? "";
    const responseDescription = sale?.ServiceResponseData?.ResponseDescription ?? "";
    if (!approved && bankRequestsAuthentication(responseCode, responseDescription)) {
      const inquiry = await albarakaInquireSale(orderId, cfg);
      if (inquiry.state === "approved") {
        await settleAlbarakaDonation(donation.id, { ...inquiry.raw, AuthCode: inquiry.authCode }, { authenticationRecovery: "confirmed-original-sale" });
        return NextResponse.json({ actionUrl: resultUrl, fields: {}, paid: true });
      }
      if (inquiry.state === "unknown") {
        await prisma.donation.updateMany({ where: donationWhereAll({ id: donation.id, providerOrderId: orderId }, donationFieldEmpty("paidAt")), data: { providerTxnResult: "PendingConfirmation", providerErrorMessage: "AUTHENTICATION_OUTCOME_UNCONFIRMED", reconciliationNextAt: new Date(Date.now() + 1_800_000) } });
        return NextResponse.json({ actionUrl: resultUrl, fields: {}, paid: false });
      }
      const secureConfig = albarakaConfig();
      if (!plan && isAlbarakaConfigured(secureConfig)) {
        const secureOrderId = albarakaOrderId();
        const fields = buildAlbaraka3DForm({ orderId: secureOrderId, amount, currencyCode, locale,
          returnUrl: `${origin}/api/albaraka/3d/callback?donationId=${encodeURIComponent(donation.id)}&locale=${encodeURIComponent(locale)}`,
          card: { number: cardNo, expireDate: expiredDate, cvc2: cvv, holderName: cardHolderName } }, secureConfig);
        const changed = await prisma.donation.updateMany({ where: donationWhereAll({ id: donation.id, providerOrderId: orderId, providerTxnResult: "Processing" }, donationFieldEmpty("paidAt")), data: {
          providerOrderId: secureOrderId, providerTxnResult: "Processing", providerErrorMessage: null,
          providerRaw: { ...(typeof donation.providerRaw === "object" && donation.providerRaw ? donation.providerRaw as object : {}),
            authenticationRecovery: { from: "2D", to: "3D", previousOrderId: orderId, reason: responseDescription, bankConfirmedNoSale: true },
            albarakaRequest: { orderId: secureOrderId, amount, currencyCode, merchantNo: secureConfig.merchantNo, terminalNo: secureConfig.terminalNo, transactionType: "Sale", mode: "3D", createdAt: new Date().toISOString() } } as Prisma.InputJsonValue,
        } });
        if (changed.count !== 1) return NextResponse.json({ error: "Payment state changed; refresh the result" }, { status: 409 });
        return NextResponse.json({ actionUrl: secureConfig.tdsUrl, fields, verificationUpgraded: true }, { headers: { "Cache-Control": "no-store" } });
      }
    }

    // The bank's answer, never the card: nothing card-bearing is logged.
    console.log("[Albaraka 2D SALE]", {
      donationId: donation.id,
      orderId,
      amount,
      currencyCode,
      plan: plan?.id ?? null,
      responseCode,
      responseDescription,
      authCode: sale?.AuthCode ?? null,
      referenceCode: sale?.ReferenceCode ?? null,
    });

    if (approved && sale) {
      await settleAlbarakaDonation(donation.id, sale);
    } else {
      const merchantSide = ALBARAKA_MERCHANT_SIDE_CODES[responseCode];
      if (merchantSide) console.error(`[Albaraka 2D SALE] ${responseCode}: ${merchantSide}`);
      await failAlbarakaDonation(
        donation.id,
        responseDescription || merchantSide || `Sale declined (${responseCode || "no response code"})`,
        { albarakaSale: sale as unknown as Record<string, unknown> },
        orderId,
        responseCode
      );
    }

    return NextResponse.json({ actionUrl: resultUrl, fields: {}, paid: approved });
  } catch (error) {
    console.error("Albaraka initiate error:", error);
    if (unsentClaim) {
      await prisma.donation
        .updateMany({ where: { id: unsentClaim, providerTxnResult: "Processing" }, data: { providerTxnResult: null } })
        .catch(() => {});
    }
    return NextResponse.json({ error: "Failed to initiate payment" }, { status: 500 });
  }
}
