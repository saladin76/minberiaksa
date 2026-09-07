import crypto from "crypto";

export type PayForCurrencyCode = "949" | "840" | "978";

export function payForCurrencyCode(currency: string): PayForCurrencyCode {
  const c = String(currency || "").toUpperCase();
  if (c === "TRY" || c === "TL") return "949";
  if (c === "EUR") return "978";
  return "840"; // default USD
}

export function payForLang(locale?: string): "TR" | "EN" {
  const l = String(locale || "").toLowerCase();
  return l === "tr" ? "TR" : "EN";
}

export function formatPayForPurchAmount(amount: number): string {
  // PayFor expects a dot-decimal string (e.g. "10.00").
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "0.00";
  return n.toFixed(2);
}

/**
 * Ziraat Katılım PayFor 3DPay hash.
 * Formula: hex(SHA1(MbrId + OrderId + PurchAmount + OkUrl + FailUrl + TxnType + InstallmentCount + Rnd + MerchantPass))
 * NOTE: MerchantID and UserCode are NOT part of the hash for this bank.
 *       Output is base64 (standard for Turkish bank PayFor MPI implementations).
 */
export function payForHash(params: {
  mbrId: string;
  orderId: string;
  purchAmount: string;
  okUrl: string;
  failUrl: string;
  txnType: string;
  installmentCount: string;
  rnd: string;
  merchantPass: string;
}): string {
  const raw =
    params.mbrId +
    params.orderId +
    params.purchAmount +
    params.okUrl +
    params.failUrl +
    params.txnType +
    params.installmentCount +
    params.rnd +
    params.merchantPass;

  return crypto.createHash("sha1").update(raw, "utf8").digest("base64");
}

