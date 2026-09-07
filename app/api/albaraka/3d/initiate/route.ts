import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import {
  ALBARAKA_FORM_FIELDS,
  albarakaConfig,
  albarakaCurrencyCode,
  albarakaFormMac,
  albarakaLang,
  albarakaMinorUnits,
  albarakaOrderId,
  isAlbarakaConfigured,
  type AlbarakaFormFields,
} from "@/lib/albaraka";
import { parseMainGateway } from "@/lib/payment-gateway";
import {
  convertAmountInCurrencyToTry,
  getUsdBaseRatesForServer,
} from "@/lib/exchange/rates-service";
import { decryptCard } from "@/lib/card-crypto";

/**
 * POST /api/albaraka/3d/initiate
 *
 * Builds the signed hidden-input set for Albaraka's SecureVerification page. The
 * browser turns the response into an HTML form and POSTs it to `actionUrl`, which
 * hands the donor over to the bank for 3D authentication; the bank then POSTs its
 * verdict to /api/albaraka/3d/callback.
 *
 * Unlike PayFor, Albaraka signs the card fields into the request MAC, so the card
 * has to be known here rather than appended by the browser. Three ways to supply it:
 *   - `savedCardId` — we decrypt the stored PAN (browser still adds nothing; the CVV
 *      is folded in from `card.cvv` since CVCs are never stored)
 *   - `card`        — the donor's freshly-typed card, posted over TLS to this route
 *   - neither, with ALBARAKA_USE_OOS=1 — the card fields go out empty and the bank's
 *      own hosted page (Ortak Ödeme Sayfası) collects them, keeping the PAN off our
 *      servers entirely. This is the deployment we'd recommend.
 */

type InitiateBody = {
  donationId: string;
  locale?: string;
  savedCardId?: string;
  card?: {
    /** PAN, spaces tolerated. */
    number?: string;
    /** "MM/YY" or "MMYY" — the bank wants YYMM, we convert. */
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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const cfg = albarakaConfig();

    if (!isAlbarakaConfigured(cfg)) {
      return NextResponse.json(
        { error: "Albaraka is not configured on server" },
        { status: 500 }
      );
    }

    // Server-side belt matching the PayFor kill-switch: the dialogs already gate the
    // UI on the selected main gateway, but a client could still call this directly.
    const settings = await prisma.globalSettings.findFirst({
      orderBy: { createdAt: "asc" },
      select: { mainGateway: true },
    });
    if (parseMainGateway(settings?.mainGateway) !== "ALBARAKA") {
      return NextResponse.json(
        { error: "Albaraka is not the selected main gateway." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Partial<InitiateBody>;
    const donationId = String(body.donationId || "").trim();
    if (!donationId) {
      return NextResponse.json({ error: "donationId is required" }, { status: 400 });
    }

    const donation = await prisma.donation.findUnique({ where: { id: donationId } });
    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }
    // Authenticated users: verify ownership. Guests have no session — trust the donationId.
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
    const origin = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
    const locale = (body.locale ?? donation.locale ?? "en").toString().toLowerCase();

    // The merchant account is Turkish, so by default every donation is converted to
    // TRY and charged in TL. Set ALBARAKA_MULTI_CURRENCY=1 only once the bank has
    // enabled USD/EUR terminals for this merchant.
    const multiCurrency = process.env.ALBARAKA_MULTI_CURRENCY === "1";
    const donationCurrency = String(donation.currency || "TRY").toUpperCase();
    const chargeInDonationCurrency =
      multiCurrency && ["TRY", "TL", "USD", "US", "EUR", "EU"].includes(donationCurrency);
    const chargeAmount = chargeInDonationCurrency
      ? donation.totalAmount
      : await toTRY(donation.totalAmount, donation.currency);
    const currencyCode = chargeInDonationCurrency
      ? albarakaCurrencyCode(donationCurrency)
      : "TL";
    const amount = albarakaMinorUnits(chargeAmount);
    if (amount <= 0) {
      return NextResponse.json({ error: "Invalid donation amount" }, { status: 400 });
    }

    // 3D orders are exactly 20 characters, so the donation's own 24-char ObjectId
    // can't be reused the way PayFor does it. The generated id is persisted and the
    // callback cross-checks it.
    const orderId = albarakaOrderId();
    const transactionType = "Sale";
    const merchantReturnURL = `${origin}/api/albaraka/3d/callback?donationId=${encodeURIComponent(
      donation.id
    )}&locale=${encodeURIComponent(locale)}`;

    // ── Card fields ────────────────────────────────────────────────────────────
    // Empty strings when the bank's hosted page collects the card. They still take
    // part in the MAC as empty values — the separator positions must not shift.
    let cardNo = "";
    let expiredDate = "";
    let cvv = "";
    let cardHolderName = "";

    if (!cfg.useOOS) {
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
        // CVCs are never stored — the donor re-types it for every saved-card charge.
        cvv = String(body.card?.cvv || "").replace(/\D/g, "");
      } else {
        cardNo = String(body.card?.number || "").replace(/\D/g, "");
        expiredDate = toBankExpiry(body.card?.expiry || "");
        cvv = String(body.card?.cvv || "").replace(/\D/g, "");
        cardHolderName = String(body.card?.holder || "").trim();
      }

      if (!cardNo || !expiredDate || !cvv) {
        return NextResponse.json(
          { error: "Card number, expiry and security code are required" },
          { status: 400 }
        );
      }
    }

    const fields: AlbarakaFormFields = {
      PosnetID: cfg.posnetId,
      MerchantNo: cfg.merchantNo,
      TerminalNo: cfg.terminalNo,
      OrderId: orderId,
      TransactionType: transactionType,
      CardNo: cardNo,
      ExpiredDate: expiredDate,
      Cvv: cvv,
      CardHolderName: cardHolderName,
      Amount: String(amount),
      InstallmentCount: "0", // 0 = peşin (single payment)
      MerchantReturnURL: merchantReturnURL,
      Language: albarakaLang(locale),
      CurrencyCode: currencyCode,
      UseJokerVadaa: cfg.useJokerVadaa ? "1" : "0",
      KOICode: "",
      // The browser decides popup vs. same-tab itself; the bank never opens one for us.
      OpenNewWindow: "0",
      UseOOS: cfg.useOOS ? "1" : "0",
      TxnState: "INITIAL",
      VftCode: "",
      gsmNo: "",
      packetCode: "",
    };

    const macNew = albarakaFormMac(fields, cfg.encKey);

    await prisma.donation.update({
      where: { id: donation.id },
      data: {
        locale,
        provider: "ALBARAKA",
        providerOrderId: orderId,
        providerTxnType: transactionType,
        // Snapshot of what we actually asked the bank to charge. The callback
        // replays it to detect an amount/order swap and to build the /Sale call
        // without re-running the FX conversion (rates can move in between).
        providerRaw: {
          albarakaRequest: {
            orderId,
            amount,
            currencyCode,
            transactionType,
            useOOS: cfg.useOOS,
            createdAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });

    // MacNew is appended after the signed fields; it is not part of its own input.
    const formFields: Record<string, string> = {};
    for (const name of ALBARAKA_FORM_FIELDS) formFields[name] = fields[name];
    formFields.MacNew = macNew;

    console.log("[Albaraka INITIATE]", {
      donationId: donation.id,
      orderId,
      amount,
      currencyCode,
      useOOS: cfg.useOOS,
      merchantReturnURL,
    });

    return NextResponse.json({ actionUrl: cfg.tdsUrl, fields: formFields });
  } catch (error) {
    console.error("Albaraka initiate error:", error);
    return NextResponse.json({ error: "Failed to initiate payment" }, { status: 500 });
  }
}
