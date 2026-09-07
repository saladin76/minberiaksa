/**
 * Friendly explanations for failed donations.
 *
 * We see two error shapes:
 *  - **PayFor** (Turkish bank gateway): a numeric `ProcReturnCode` (e.g. "05",
 *    "51", "12") plus the raw bank `ErrorMessage`. The codes follow ISO 8583
 *    response codes that Turkish banks commonly emit.
 *  - **Stripe**: usually a free-form `providerErrorMessage` like
 *    "Your card was declined" or "Your card has expired". Sometimes a
 *    `decline_code` string we mirror into providerErrorMessage.
 *
 * `resolvePaymentError` collapses both into a single `ResolvedPaymentError`
 * keyed by a stable `key` (e.g. `"insufficientFunds"`). The page then renders
 * `Profile.paymentErrors.<key>.{title,reason,fix}` translations — letting us
 * localize without re-running this matcher.
 *
 * IMPORTANT: the matcher must be conservative — when we can't classify the
 * error, fall back to `"generic"` (which has a friendly catch-all). NEVER
 * misclassify (e.g. "expired card" → "wrong CVV") because the wrong fix
 * advice is worse than no advice.
 */

export type PaymentErrorKey =
  | "insufficientFunds"
  | "cardDeclined"
  | "expiredCard"
  | "invalidCvc"
  | "incorrectNumber"
  | "lostOrStolen"
  | "doNotHonor"
  | "limitExceeded"
  | "currencyNotSupported"
  | "authenticationFailed"
  | "processingError"
  | "networkError"
  | "issuerUnavailable"
  | "fraudSuspected"
  | "generic";

export interface ResolvedPaymentError {
  /** Stable key — used to look up Profile.paymentErrors.<key>.* translations. */
  key: PaymentErrorKey;
  /** Severity drives the page accent color. "soft" = card-issue (likely to succeed on retry).
   *  "hard" = blocked by the bank (donor needs to act before retrying). */
  severity: "soft" | "hard";
  /** True when retrying with the SAME card is likely to succeed (e.g. transient
   *  network/processing issues). False means the donor should try a different
   *  card / payment method before retrying. */
  retryableSameCard: boolean;
}

/**
 * ISO 8583 / Turkish bank response code → our internal key.
 * Sources: standard ISO 8583 codes + common Türkiye İş Bankası / PayFor
 * mappings observed in production callbacks. Albaraka returns the same
 * ISO-8583 codes in ServiceResponseData.ResponseCode, which we store in the
 * same providerProcReturnCode column, so this map covers both gateways.
 */
const PAYFOR_CODE_MAP: Record<string, PaymentErrorKey> = {
  "00": "generic", // success — shouldn't land here, but keep mapping safe
  "01": "doNotHonor", // refer to card issuer
  "02": "doNotHonor",
  "03": "processingError", // invalid merchant
  "04": "lostOrStolen", // pick-up card
  "05": "cardDeclined", // do not honor
  "06": "processingError",
  "07": "lostOrStolen", // pick-up card, special condition
  "12": "processingError", // invalid transaction
  "13": "processingError", // invalid amount
  "14": "incorrectNumber", // invalid card number
  "15": "processingError", // no such issuer
  "30": "processingError", // format error
  "33": "expiredCard", // expired card, pickup
  "34": "fraudSuspected", // suspected fraud
  "36": "lostOrStolen",
  "37": "lostOrStolen",
  "38": "authenticationFailed", // allowable PIN tries exceeded
  "41": "lostOrStolen", // lost card
  "43": "lostOrStolen", // stolen card
  "51": "insufficientFunds", // insufficient funds
  "52": "doNotHonor", // no checking account
  "53": "doNotHonor", // no savings account
  "54": "expiredCard", // expired card
  "55": "authenticationFailed", // incorrect PIN
  "57": "doNotHonor", // transaction not permitted to cardholder
  "58": "doNotHonor", // transaction not permitted to terminal
  "59": "fraudSuspected", // suspected fraud
  "61": "limitExceeded", // exceeds withdrawal amount limit
  "62": "doNotHonor", // restricted card
  "63": "fraudSuspected", // security violation
  "65": "limitExceeded", // exceeds withdrawal frequency limit
  "75": "authenticationFailed", // allowable number of PIN tries exceeded
  "76": "processingError",
  "77": "processingError",
  "78": "doNotHonor",
  "82": "invalidCvc", // CVV failure
  "84": "expiredCard",
  "85": "doNotHonor",
  "88": "issuerUnavailable",
  "89": "issuerUnavailable",
  "91": "issuerUnavailable", // issuer unavailable
  "92": "networkError", // financial institution cannot be found
  "93": "doNotHonor", // transaction cannot be completed - violation of law
  "94": "processingError", // duplicate transaction
  "96": "processingError", // system malfunction
  "B1": "authenticationFailed", // surcharge amount not permitted
  "N7": "invalidCvc",
  "R0": "authenticationFailed",
  "R1": "authenticationFailed",
  "R3": "authenticationFailed",
};

/** Substring patterns matched (case-insensitive) against any free-text error message. */
const TEXT_PATTERNS: Array<{ pattern: RegExp; key: PaymentErrorKey }> = [
  // Stripe decline codes (and the prose Stripe shows for each)
  { pattern: /insufficient[_\s]*funds|insufficient[_\s]*balance|رصيد\s*غير\s*كاف/i, key: "insufficientFunds" },
  { pattern: /expired[_\s]*card|card[_\s]*expired|carte\s+expirée|بطاقة\s*منتهية/i, key: "expiredCard" },
  { pattern: /incorrect[_\s]*cvc|invalid[_\s]*cvc|cvc[_\s]*check[_\s]*failed|cvv\s*incorrect|رمز\s*التحقق/i, key: "invalidCvc" },
  { pattern: /incorrect[_\s]*number|invalid[_\s]*card[_\s]*number|invalid[_\s]*account[_\s]*number|wrong[_\s]*card[_\s]*number/i, key: "incorrectNumber" },
  { pattern: /lost[_\s]*card|stolen[_\s]*card|pickup|pick[_\s]*up[_\s]*card|بطاقة\s*مفقودة|بطاقة\s*مسروقة/i, key: "lostOrStolen" },
  { pattern: /do[_\s]*not[_\s]*honor|generic[_\s]*decline|transaction[_\s]*not[_\s]*allowed/i, key: "doNotHonor" },
  { pattern: /withdrawal[_\s]*count[_\s]*exceeded|amount[_\s]*limit[_\s]*exceeded|spending[_\s]*limit/i, key: "limitExceeded" },
  { pattern: /currency[_\s]*not[_\s]*supported|currency.*not[_\s]*allowed/i, key: "currencyNotSupported" },
  // 3-D Secure / SCA authentication failures
  { pattern: /authentication[_\s]*(required|failed)|3d[_\s_]?secure|sca[_\s]*failed|impossible.*authentifier/i, key: "authenticationFailed" },
  { pattern: /processing[_\s]*error|try[_\s]*again|temporary[_\s]*error/i, key: "processingError" },
  { pattern: /network[_\s]*error|connection[_\s]*error|timeout/i, key: "networkError" },
  { pattern: /issuer[_\s]*not[_\s]*available|issuer[_\s]*unavailable|issuer[_\s]*declined/i, key: "issuerUnavailable" },
  { pattern: /fraudulent|fraud[_\s]*suspected|suspected[_\s]*fraud|stolen[_\s]*card/i, key: "fraudSuspected" },
  // Generic decline catch-all
  { pattern: /card[_\s]*declined|votre[_\s]*carte.*refusée|البطاقة\s*رفض|تم\s*رفض/i, key: "cardDeclined" },
];

const SEVERITY_AND_RETRY: Record<
  PaymentErrorKey,
  { severity: "soft" | "hard"; retryableSameCard: boolean }
> = {
  insufficientFunds: { severity: "hard", retryableSameCard: false },
  cardDeclined: { severity: "soft", retryableSameCard: false },
  expiredCard: { severity: "hard", retryableSameCard: false },
  invalidCvc: { severity: "soft", retryableSameCard: true },
  incorrectNumber: { severity: "soft", retryableSameCard: true },
  lostOrStolen: { severity: "hard", retryableSameCard: false },
  doNotHonor: { severity: "soft", retryableSameCard: false },
  limitExceeded: { severity: "hard", retryableSameCard: false },
  currencyNotSupported: { severity: "hard", retryableSameCard: false },
  authenticationFailed: { severity: "soft", retryableSameCard: true },
  processingError: { severity: "soft", retryableSameCard: true },
  networkError: { severity: "soft", retryableSameCard: true },
  issuerUnavailable: { severity: "soft", retryableSameCard: true },
  fraudSuspected: { severity: "hard", retryableSameCard: false },
  generic: { severity: "soft", retryableSameCard: true },
};

export interface DonationErrorInputs {
  providerProcReturnCode?: string | null;
  providerErrorMessage?: string | null;
  providerTxnResult?: string | null;
  provider?: string | null;
}

export function resolvePaymentError(input: DonationErrorInputs): ResolvedPaymentError {
  // 1. Try the bank's numeric code first (PayFor / Albaraka) — most reliable signal.
  const rawCode = (input.providerProcReturnCode ?? "").toString().trim();
  if (rawCode && PAYFOR_CODE_MAP[rawCode]) {
    const key = PAYFOR_CODE_MAP[rawCode];
    return { key, ...SEVERITY_AND_RETRY[key] };
  }

  // 2. Fall back to free-text pattern matching across the error/result fields.
  const haystack = [
    input.providerErrorMessage,
    input.providerTxnResult,
  ]
    .filter(Boolean)
    .join(" | ");
  if (haystack) {
    for (const { pattern, key } of TEXT_PATTERNS) {
      if (pattern.test(haystack)) {
        return { key, ...SEVERITY_AND_RETRY[key] };
      }
    }
  }

  return { key: "generic", ...SEVERITY_AND_RETRY["generic"] };
}
