import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { donationFieldEmpty, donationWhereAll } from "@/lib/donations/mongo-null";
import { albaraka3DLinkageError } from "@/lib/donations/albaraka-3d-verification";
import { isValidLocale } from "@/lib/locales";
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
  isAlbarakaTransportFailure,
  type AlbarakaServiceResponse,
} from "@/lib/albaraka";
import { failAlbarakaDonation, settleAlbarakaDonation } from "@/lib/donations/albaraka-settlement";
import { withDonationToken } from "@/lib/donations/access-token";

// Calls Albaraka's /Sale, which only accepts the project's Static IPs (sin1).
export const preferredRegion = "sin1";

/**
 * POST /api/albaraka/3d/callback
 *
 * Albaraka posts the 3D verification result back here (single return URL  there is
 * no separate ok/fail pair like PayFor's). Three gates before any money moves:
 *
 *   1. MacNew must match what we recompute over the returned parameters, proving the
 *      amount / order / verdict weren't rewritten in the browser round-trip.
 *   2. The order must be the one we started, for the amount we started it with.
 *   3. MdStatus must be 1 (full 3D). The bank explicitly recommends stopping otherwise,
 *      and "half 3D" (2/3/4) must never silently downgrade the donor's 3D choice.
 *
 * Only then do we call /Sale to actually capture  3D verification alone is not a charge.
 */

type RequestSnapshot = {
  orderId?: string;
  amount?: number;
  currencyCode?: string;
  transactionType?: string;
  mode?: string;
};

function readRequestSnapshot(raw: unknown): RequestSnapshot {
  if (!raw || typeof raw !== "object") return {};
  const req = (raw as Record<string, unknown>).albarakaRequest;
  if (!req || typeof req !== "object") return {};
  return req as RequestSnapshot;
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
  const requestedLocale = (searchParams.get("locale") || "en").toLowerCase();
  const locale = isValidLocale(requestedLocale) ? requestedLocale : "en";

  const failUrl = donationId
    ? new URL(
        `/${locale}/donation-failed?donationId=${encodeURIComponent(donationId)}`,
        origin
      )
    : new URL(`/${locale}/donation-failed`, origin);
  // The bank sends the donor here with a POST; a 303 makes the browser follow it as a GET.
  const redirect = (url: URL) => NextResponse.redirect(url, 303);

  if (!/^[a-f0-9]{24}$/i.test(donationId)) return redirect(failUrl);

  const form = await req.formData();
  const raw: Record<string, string> = {};
  for (const [key, value] of form.entries()) raw[key] = String(value);


  // Persist only verification outcomes, never arbitrary bank echo fields or authentication data.
  const verificationAudit = Object.fromEntries(["OrderId", "Amount", "Currency", "MerchantId", "MdStatus", "MdErrorMessage"].filter(key => key in raw).map(key => [key, raw[key]]));
  const cfg = albarakaConfig();
  const mdStatus = String(raw.MdStatus ?? "");
  const orderId = String(raw.OrderId ?? "");
  const secureTransactionId = String(raw.SecureTransactionId ?? "");
  const cavv = String(raw.CAVV ?? "");
  const eci = String(raw.ECI ?? "");
  const md = String(raw.MD ?? "");
  const mdErrorMessage = String(raw.MdErrorMessage ?? "");
  let captureAttempted = false;
  let verified = false;
  let originalMode: string | undefined;
  let accessToken: string | null = null;
  const successUrl = () => new URL(withDonationToken(`/${locale}/success/${donationId}`, accessToken), origin);
  async function pending() {
    // A lost capture response is NOT a decline. Hold the claim for reconciliation;
    // never retry Sale or tell the donor to pay again for an uncertain outcome.
    await prisma.donation.updateMany({
      where: donationWhereAll({ id: donationId, providerOrderId: orderId, providerTxnResult: "Capturing3D" }, donationFieldEmpty("paidAt")),
      data: { providerErrorMessage: "3D payment outcome requires confirmation; no automatic recapture will be attempted." },
    }).catch(() => {});
    return redirect(successUrl());
  }

  /** Marks the donation failed (unless already paid) and sends the donor to the failure page. */
  async function fail(reason: string, extra: Record<string, unknown> = {}, code?: string) {
    if (!verified) return redirect(failUrl);
    if (!captureAttempted) {
      const rejected = await prisma.donation.updateMany({
        where: donationWhereAll({ id: donationId, provider: "ALBARAKA", providerOrderId: orderId, status: { not: "FAILED" } }, donationFieldEmpty("paidAt"),
          originalMode === "3D" ? { providerTxnResult: "Processing" } : { OR: [{ providerTxnResult: "Processing" }, { providerTxnResult: null }, { providerTxnResult: { isSet: false } }] }),
        data: { providerTxnResult: "Rejecting3D" },
      });
      if (rejected.count !== 1) return redirect(successUrl());
    }
    await failAlbarakaDonation(donationId, reason, { albarakaVerification: verificationAudit, ...extra }, orderId, code);
    return redirect(failUrl);
  }

  try {
    if (!isAlbarakaConfigured(cfg)) {
      return redirect(failUrl);
    }

    const donation = await prisma.donation.findUnique({ where: { id: donationId } });
    if (!donation) return redirect(failUrl);


    // ── 1. MAC verification ──────────────────────────────────────────────────
    const expectedMac = albarakaResponseMac(raw, cfg.encKey);
    const receivedMac = String(raw.MacNew ?? "");
    if (!receivedMac || !macEquals(expectedMac, receivedMac)) {
      return redirect(failUrl);
    }

    // ── 2. Order / amount linkage ────────────────────────────────────────────
    const snapshot = readRequestSnapshot(donation.providerRaw);
    const expectedOrderId = donation.providerOrderId ?? snapshot.orderId ?? "";
    if (albaraka3DLinkageError(raw, snapshot, expectedOrderId, cfg.merchantNo)) return redirect(failUrl);
    verified = true;
    originalMode = snapshot.mode;
    accessToken = donation.accessToken;
    if (accessToken) failUrl.searchParams.set("t", accessToken);
    if (donation.paidAt) return redirect(successUrl());
    if (donation.status === "FAILED") return redirect(failUrl);
    const returnedAmount = Number(raw.Amount);
    if (
      typeof snapshot.amount === "number" &&
      Number.isFinite(returnedAmount) &&
      snapshot.amount !== returnedAmount
    ) {
      return redirect(failUrl);
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

    // Claim BEFORE Sale: two authentic callback deliveries must capture once.
    const claim = await prisma.donation.updateMany({
      where: donationWhereAll(
        { id: donationId, provider: "ALBARAKA", providerOrderId: expectedOrderId, status: { not: "FAILED" } },
        donationFieldEmpty("paidAt"),
        snapshot.mode === "3D" ? { providerTxnResult: "Processing" } : { OR: [{ providerTxnResult: "Processing" }, { providerTxnResult: null }, { providerTxnResult: { isSet: false } }] },
      ),
      data: { providerTxnResult: "Capturing3D" },
    });
    if (claim.count !== 1) return redirect(successUrl());

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

    captureAttempted = true;
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
      { correlationId: orderId || expectedOrderId || donationId, config: cfg }
    );

    if (isAlbarakaTransportFailure(sale)) return await pending();

    const responseCode = sale.ServiceResponseData?.ResponseCode ?? "";
    const responseDescription = sale.ServiceResponseData?.ResponseDescription ?? "";

    if (!isAlbarakaApproved(sale)) {
      return await fail(responseDescription || `Sale declined (${responseCode})`, {
        albarakaSale: sale as unknown as Record<string, unknown>,
      }, responseCode);
    }

    // ── 5. Settle ────────────────────────────────────────────────────────────
    const settled = await settleAlbarakaDonation(donationId, sale, { albarakaVerification: verificationAudit });
    if (!settled) return await pending();
    return redirect(successUrl());
  } catch {
    console.error("Albaraka callback could not complete; private response details suppressed.");
    if (verified && captureAttempted) return await pending();
    return redirect(failUrl);
  }
}
