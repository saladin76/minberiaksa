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
 * Record a bank response without discarding the request snapshot.
 *
 * `initiate` writes `payforRequest` into `providerRaw` — what we actually asked
 * the bank to charge. Both callbacks used to overwrite the whole column with the
 * bank's POST body, which threw that away: the amount check has nothing to compare
 * against, and reconciliation loses what the donor was asked to pay.
 */
export function mergePayForProviderRaw(
  existing: unknown,
  response: Record<string, unknown>
): Record<string, unknown> {
  const base =
    typeof existing === "object" && existing ? (existing as Record<string, unknown>) : {};
  return { ...base, payforResponse: response };
}

/**
 * Strip anything card-shaped out of a bank response before it is logged.
 *
 * The 3DPay callbacks log the bank's whole POST body, which is genuinely useful
 * when the bank asks what it sent — but the body is the bank's to shape, not ours,
 * and a field carrying a PAN would land in the hosting provider's log stream
 * permanently. Keys are matched by name so a field we have never seen is redacted
 * on the way in rather than after someone notices it.
 */
const PAYFOR_SENSITIVE_KEY = /pan|card *(no|number)|cvv|cvc|expiry|expdate|pass|secret|hash|mac/i;

export function redactPayForResponse(raw: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!PAYFOR_SENSITIVE_KEY.test(key)) {
      safe[key] = value;
      continue;
    }
    /* Keep the last four when the bank already masked it — that is what makes a
       log useful for matching a donor's receipt — and nothing otherwise. */
    const text = String(value ?? "");
    safe[key] = text.length > 4 ? `***${text.slice(-4)}` : "***";
  }
  return safe;
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

