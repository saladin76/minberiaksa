import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ALBARAKA_PAYMENT_MAC_PARAMS,
  albarakaConfig,
  albarakaMdStatusMessage,
  albarakaPaymentMac,
  albarakaResponseMac,
  albarakaService,
  isAlbarakaApproved,
  isAlbarakaConfigured,
  type AlbarakaServiceResponse,
} from "@/lib/albaraka";
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";
import { dispatchDonationPaid, dispatchEvent } from "@/lib/events/dispatch";

/**
 * POST /api/albaraka/3d/callback
 *
 * Albaraka posts the 3D verification result back here (single return URL — there is
 * no separate ok/fail pair like PayFor's). Three gates before any money moves:
 *
 *   1. MacNew must match what we recompute over the returned parameters, proving the
 *      amount / order / verdict weren't rewritten in the browser round-trip.
 *   2. The order must be the one we started, for the amount we started it with.
 *   3. MdStatus must be 1 (full 3D). The bank explicitly recommends stopping otherwise,
 *      and "half 3D" (2/3/4) would need a non-3D terminal we don't have.
 *
 * Only then do we call /Sale to actually capture — 3D verification alone is not a charge.
 */

type RequestSnapshot = {
  orderId?: string;
  amount?: number;
  currencyCode?: string;
  transactionType?: string;
};

function readRequestSnapshot(raw: unknown): RequestSnapshot {
  if (!raw || typeof raw !== "object") return {};
  const req = (raw as Record<string, unknown>).albarakaRequest;
  if (!req || typeof req !== "object") return {};
  return req as RequestSnapshot;
}

/** Prisma's Json input type doesn't accept a plain index signature without a nudge. */
function asJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Timing-safe comparison so a mismatching MAC can't be probed byte by byte. */
function macEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  const origin = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const { searchParams } = new URL(req.url);
  const donationId = searchParams.get("donationId") || "";
  const locale = (searchParams.get("locale") || "en").toLowerCase();

  const failUrl = donationId
    ? new URL(
        `/${locale}/donation-failed?donationId=${encodeURIComponent(donationId)}`,
        origin
      )
    : new URL(`/${locale}/donation-failed`, origin);
  // The bank sends the donor here with a POST; a 303 makes the browser follow it as a GET.
  const redirect = (url: URL) => NextResponse.redirect(url, 303);

  if (!donationId) return redirect(failUrl);

  const form = await req.formData();
  const raw: Record<string, string> = {};
  for (const [key, value] of form.entries()) raw[key] = String(value);

  console.log("[Albaraka CALLBACK] Bank response:", JSON.stringify(raw, null, 2));

  const cfg = albarakaConfig();
  const mdStatus = String(raw.MdStatus ?? "");
  const orderId = String(raw.OrderId ?? "");
  const secureTransactionId = String(raw.SecureTransactionId ?? "");
  const cavv = String(raw.CAVV ?? "");
  const eci = String(raw.ECI ?? "");
  const md = String(raw.MD ?? "");
  const mdErrorMessage = String(raw.MdErrorMessage ?? "");

  /** Marks the donation failed (unless already paid) and sends the donor to the failure page. */
  async function fail(reason: string, extra: Record<string, unknown> = {}) {
    console.error("[Albaraka CALLBACK] failed:", reason, extra);
    try {
      const donation = await prisma.donation.findUnique({ where: { id: donationId } });
      if (donation && donation.paidAt === null) {
        await prisma.donation.update({
          where: { id: donationId },
          data: {
            status: "FAILED",
            provider: "ALBARAKA",
            providerOrderId: donation.providerOrderId ?? orderId ?? null,
            providerTxnResult: "Failed",
            providerErrorMessage: reason,
            providerRaw: asJson({
              ...(typeof donation.providerRaw === "object" && donation.providerRaw
                ? (donation.providerRaw as Record<string, unknown>)
                : {}),
              albarakaVerification: raw,
              ...extra,
            }),
          },
        });
        void dispatchEvent("DONATION_FAILED", { donationId });
        // Seed Meta with the failed attempt so lookalike audiences can include
        // donors-who-tried; the browser pixel fires the matching DonateFailed hit
        // with the same `${donationId}_failed` event id for dedup.
        void sendDonationFailedConversions(donationId);
      }
    } catch (e) {
      console.error("[Albaraka CALLBACK] failure bookkeeping error:", e);
    }
    return redirect(failUrl);
  }

  try {
    if (!isAlbarakaConfigured(cfg)) {
      return await fail("Albaraka is not configured on server");
    }

    const donation = await prisma.donation.findUnique({ where: { id: donationId } });
    if (!donation) return redirect(failUrl);

    // Idempotency: a duplicate callback for an already-captured donation is a no-op.
    if (donation.paidAt !== null) {
      return redirect(new URL(`/${locale}/success/${donationId}`, origin));
    }

    // ── 1. MAC verification ──────────────────────────────────────────────────
    const expectedMac = albarakaResponseMac(raw, cfg.encKey);
    const receivedMac = String(raw.MacNew ?? "");
    if (!receivedMac || !macEquals(expectedMac, receivedMac)) {
      return await fail("3D response MAC mismatch — response could not be verified");
    }

    // ── 2. Order / amount linkage ────────────────────────────────────────────
    const snapshot = readRequestSnapshot(donation.providerRaw);
    const expectedOrderId = donation.providerOrderId ?? snapshot.orderId ?? "";
    if (expectedOrderId && orderId && expectedOrderId !== orderId) {
      return await fail(`OrderId mismatch (expected ${expectedOrderId}, got ${orderId})`);
    }
    const returnedAmount = Number(raw.Amount);
    if (
      typeof snapshot.amount === "number" &&
      Number.isFinite(returnedAmount) &&
      snapshot.amount !== returnedAmount
    ) {
      return await fail(
        `Amount mismatch (expected ${snapshot.amount}, got ${returnedAmount})`
      );
    }

    // ── 3. 3D verdict ────────────────────────────────────────────────────────
    if (mdStatus !== "1") {
      return await fail(
        mdErrorMessage || albarakaMdStatusMessage(mdStatus),
        { albarakaMdStatus: mdStatus }
      );
    }
    if (!secureTransactionId) {
      return await fail("Bank returned no SecureTransactionId for a verified 3D session");
    }

    // ── 4. Capture ───────────────────────────────────────────────────────────
    const amount = typeof snapshot.amount === "number" ? snapshot.amount : returnedAmount;
    const currencyCode = snapshot.currencyCode ?? String(raw.Currency ?? "TL");

    const paymentMac = albarakaPaymentMac(
      {
        merchantNo: cfg.merchantNo,
        terminalNo: cfg.terminalNo,
        secureTransactionId,
        cavvData: cavv,
        eci,
        mdStatus,
      },
      cfg.encKey
    );

    const sale: AlbarakaServiceResponse = await albarakaService(
      "Sale",
      {
        ApiType: "JSON",
        ApiVersion: "V100",
        MerchantNo: cfg.merchantNo,
        TerminalNo: cfg.terminalNo,
        PaymentInstrumentType: "CARD",
        IsEncrypted: "N",
        IsTDSecureMerchant: "Y",
        IsMailOrder: "N",
        ThreeDSecureData: {
          SecureTransactionId: secureTransactionId,
          CavvData: cavv,
          Eci: eci,
          MdStatus: Number(mdStatus),
          MD: md,
        },
        MAC: paymentMac,
        MACParams: ALBARAKA_PAYMENT_MAC_PARAMS,
        Amount: amount,
        CurrencyCode: currencyCode,
        PointAmount: 0,
        OrderId: orderId || expectedOrderId,
        InstallmentCount: 0,
      },
      { correlationId: orderId || expectedOrderId || donationId }
    );

    console.log("[Albaraka CALLBACK] Sale response:", JSON.stringify(sale, null, 2));

    const responseCode = sale.ServiceResponseData?.ResponseCode ?? "";
    const responseDescription = sale.ServiceResponseData?.ResponseDescription ?? "";

    if (!isAlbarakaApproved(sale)) {
      return await fail(responseDescription || `Sale declined (${responseCode})`, {
        albarakaSale: sale as unknown as Record<string, unknown>,
      });
    }

    // ── 5. Settle ────────────────────────────────────────────────────────────
    const settled = await prisma.$transaction(async (tx) => {
      const fresh = await tx.donation.findUnique({
        where: { id: donationId },
        include: { items: true, categoryItems: true },
      });
      if (!fresh) return false;
      // Re-check inside the transaction — two callbacks can race here.
      if (fresh.paidAt !== null) return true;

      await tx.donation.update({
        where: { id: fresh.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          provider: "ALBARAKA",
          providerProcReturnCode: responseCode || null,
          providerTxnResult: "Success",
          providerAuthCode: sale.AuthCode ? String(sale.AuthCode) : null,
          // Albaraka's ReferenceCode is what İptal/İade are later keyed on, so it
          // lands in the same column PayFor uses for its host reference.
          providerHostRefNum: sale.ReferenceCode ? String(sale.ReferenceCode) : null,
          providerErrorMessage: null,
          providerRaw: asJson({
            ...(typeof fresh.providerRaw === "object" && fresh.providerRaw
              ? (fresh.providerRaw as Record<string, unknown>)
              : {}),
            albarakaVerification: raw,
            albarakaSale: sale as unknown as Record<string, unknown>,
          }),
        },
      });

      // Apply increments only on confirmed payment.
      for (const item of fresh.items) {
        await tx.campaign.update({
          where: { id: item.campaignId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }
      for (const item of fresh.categoryItems) {
        await tx.category.update({
          where: { id: item.categoryId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }
      return true;
    });

    if (!settled) return redirect(failUrl);

    void dispatchDonationPaid(donationId);
    return redirect(new URL(`/${locale}/success/${donationId}`, origin));
  } catch (e) {
    console.error("Albaraka callback error:", e);
    return await fail(e instanceof Error ? e.message : "Albaraka callback error");
  }
}
