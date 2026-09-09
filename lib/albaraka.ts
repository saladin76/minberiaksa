import crypto from "crypto";

/**
 * Albaraka Türk EPOS (Sanal POS) — 3D Secure integration primitives.
 *
 * Reference: "Sanal Pos 3D Secure Entegrasyon Dokümanı" (Albaraka Türk / Posnet EPOS API).
 *
 * Three distinct MAC algorithms are involved; all three are implemented here and were
 * verified byte-for-byte against the worked examples in the bank's document:
 *
 *  1. `albarakaFormMac`     — HMAC-SHA256, signs the 3DS redirect form we POST to the bank.
 *  2. `albarakaResponseMac` — HMAC-SHA256, verifies the form the bank POSTs back to us.
 *  3. `albarakaPaymentMac`  — plain SHA256, signs the /Sale call that finalises the 3D auth.
 *
 * For 1 and 2 the message is the ordered parameter values joined with ";", with the
 * encryption key appended after a final ";" — and that same key is also the HMAC key.
 * For 3 the message is the values concatenated with no separator, key appended, hashed
 * with a bare SHA256 (not HMAC).
 */

/** Albaraka accepts only these three currency codes. */
export type AlbarakaCurrencyCode = "TL" | "US" | "EU";

export type AlbarakaConfig = {
  merchantNo: string;
  terminalNo: string;
  posnetId: string;
  encKey: string;
  /** Bank page the customer's browser is form-POSTed to for 3D verification. */
  tdsUrl: string;
  /** JSON transaction service root; "/Sale", "/Reverse", … are appended to it. */
  serviceUrl: string;
  /** When true the bank collects the card (Ortak Ödeme Sayfası) and no PAN reaches us. */
  useOOS: boolean;
  /** Opens the bank's Joker Vadaa campaign picker before 3D verification. */
  useJokerVadaa: boolean;
};

/**
 * No merchant identifier is defaulted.
 *
 * They are not secrets — the same numbers are printed in the bank's merchant portal
 * under "Üye İşyeri Bilgilerim" — but a wrong one is worse than a missing one: a
 * hard-coded fallback means an unset env var silently signs live 3D forms with some
 * other merchant's numbers instead of failing. `isAlbarakaConfigured` gates on all
 * four, so an incomplete deployment refuses to initiate rather than mis-routing.
 *
 * A merchant may hold several terminals (this one holds three). Each has its own
 * TerminalNo *and* its own PosnetID, and the two must come from the same row of the
 * portal — mixing them across terminals fails MAC verification at the bank.
 *
 * ALBARAKA_ENC_KEY is the shared secret behind every MAC, created from Kurumsal
 * İnternet Bankacılığı → Üye İşyeri → "Anahtar Yaratma".
 */
export function albarakaConfig(): AlbarakaConfig {
  return {
    merchantNo: process.env.ALBARAKA_MERCHANT_NO ?? "",
    terminalNo: process.env.ALBARAKA_TERMINAL_NO ?? "",
    posnetId: process.env.ALBARAKA_POSNET_ID ?? "",
    encKey: process.env.ALBARAKA_ENC_KEY ?? "",
    tdsUrl:
      process.env.ALBARAKA_3DS_URL ??
      "https://epos.albarakaturk.com.tr/ALBSecurePaymentUI/SecureProcess/SecureVerification.aspx",
    serviceUrl: (
      process.env.ALBARAKA_SERVICE_URL ??
      "https://epos.albarakaturk.com.tr/ALBMerchantService/MerchantJSONAPI.svc"
    ).replace(/\/$/, ""),
    useOOS: process.env.ALBARAKA_USE_OOS === "1",
    useJokerVadaa: process.env.ALBARAKA_USE_JOKER_VADAA === "1",
  };
}

/** Nothing is defaulted, so readiness means all four identifiers are actually set. */
export function isAlbarakaConfigured(cfg: AlbarakaConfig = albarakaConfig()): boolean {
  return Boolean(cfg.encKey && cfg.merchantNo && cfg.terminalNo && cfg.posnetId);
}

export function albarakaCurrencyCode(currency: string): AlbarakaCurrencyCode {
  const c = String(currency || "").toUpperCase();
  if (c === "USD" || c === "US") return "US";
  if (c === "EUR" || c === "EU") return "EU";
  return "TL";
}

export function albarakaLang(locale?: string): "TR" | "EN" {
  return String(locale || "").toLowerCase() === "tr" ? "TR" : "EN";
}

/** Amounts travel in minor units — 12.34 TL is sent as 1234. */
export function albarakaMinorUnits(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/**
 * 3D orders must be exactly 20 characters (non-3D uses 24, and cancelling a 3D order
 * re-expands it to 24 by prefixing "TDS_"). 10 random bytes as uppercase hex lands on
 * 20 characters with 80 bits of entropy.
 */
export function albarakaOrderId(): string {
  return crypto.randomBytes(10).toString("hex").toUpperCase();
}

function hmacSha256Base64(message: string, key: string): string {
  return crypto
    .createHmac("sha256", Buffer.from(key, "utf8"))
    .update(Buffer.from(message, "utf8"))
    .digest("base64");
}

function sha256Base64(message: string): string {
  return crypto.createHash("sha256").update(Buffer.from(message, "utf8")).digest("base64");
}

/**
 * Field order of the 3D verification form. The MAC is computed over the values in
 * exactly this order, so this array is the single source of truth for both the MAC
 * input and the hidden inputs the browser posts.
 */
export const ALBARAKA_FORM_FIELDS = [
  "PosnetID",
  "MerchantNo",
  "TerminalNo",
  "OrderId",
  "TransactionType",
  "CardNo",
  "ExpiredDate",
  "Cvv",
  "CardHolderName",
  "Amount",
  "InstallmentCount",
  "MerchantReturnURL",
  "Language",
  "CurrencyCode",
  "UseJokerVadaa",
  "KOICode",
  "OpenNewWindow",
  "UseOOS",
  "TxnState",
  "VftCode",
  "gsmNo",
  "packetCode",
] as const;

export type AlbarakaFormFields = Record<(typeof ALBARAKA_FORM_FIELDS)[number], string>;

/**
 * MacNew for the outgoing 3D form.
 * Verified against the bank's worked example:
 *   1010054515195582;6700972671;67908222;ALB_TST_25111101ss22;Sale;…;INITIAL;;;;<encKey>
 *   → t+TjQCIihRDsAHzO5pVb1ibHZmZw5VMsC885KiSe14E=
 * Fields we don't send still take part as empty strings — dropping them shifts every
 * later value one separator to the left and the bank rejects the form.
 */
export function albarakaFormMac(fields: AlbarakaFormFields, encKey: string): string {
  const message =
    ALBARAKA_FORM_FIELDS.map((name) => fields[name] ?? "").join(";") + ";" + encKey;
  return hmacSha256Base64(message, encKey);
}

/** Parameter order of the MacNew the bank sends back after 3D verification. */
export const ALBARAKA_RESPONSE_MAC_FIELDS = [
  "CCPrefix",
  "TranType",
  "Amount",
  "OrderId",
  "MerchantId",
  "CAVV",
  "CAVVAlgorithm",
  "ECI",
  "MD",
  "MdErrorMessage",
  "MdStatus",
  "SecureTransactionId",
  "Currency",
] as const;

/**
 * Recomputes the MacNew the bank attached to its callback so we can prove the
 * amount / order / 3D verdict weren't tampered with during the browser round-trip.
 * Verified against the bank's worked example:
 *   450634;Sale;2500;…;Successful;1;1010078005220492;TL;<encKey>
 *   → 4XYPXgwGWcmrC+8Y+/cmkZOsxBVBpGynIbLCbjFZBk0=
 */
export function albarakaResponseMac(
  values: Record<string, string | undefined>,
  encKey: string
): string {
  const message =
    ALBARAKA_RESPONSE_MAC_FIELDS.map((name) => values[name] ?? "").join(";") + ";" + encKey;
  return hmacSha256Base64(message, encKey);
}

/**
 * MAC for the /Sale call that turns a completed 3D verification into money.
 * Plain SHA256 (NOT HMAC) over the values concatenated without separators, with the
 * encryption key appended. The MACParams string sent alongside it is
 * "MerchantNo:TerminalNo:SecureTransactionId:CavvData:Eci:MdStatus".
 * Verified against the bank's worked example → kAKxvbwXvmrM6lapGx1UcRTs454tsSuPrBXV7oA7L7w=
 */
export function albarakaPaymentMac(
  params: {
    merchantNo: string;
    terminalNo: string;
    secureTransactionId: string;
    cavvData: string;
    eci: string;
    mdStatus: string;
  },
  encKey: string
): string {
  return sha256Base64(
    params.merchantNo +
      params.terminalNo +
      params.secureTransactionId +
      params.cavvData +
      params.eci +
      params.mdStatus +
      encKey
  );
}

export const ALBARAKA_PAYMENT_MAC_PARAMS =
  "MerchantNo:TerminalNo:SecureTransactionId:CavvData:Eci:MdStatus";

export type AlbarakaServiceResponse = {
  ServiceResponseData?: { ResponseCode?: string; ResponseDescription?: string };
  AuthCode?: string | null;
  ReferenceCode?: string | null;
  [key: string]: unknown;
};

/**
 * The bank documents "0000" as success but its own sample responses return "00",
 * so both are accepted.
 */
export function isAlbarakaApproved(res: AlbarakaServiceResponse | null): boolean {
  const code = res?.ServiceResponseData?.ResponseCode;
  return code === "00" || code === "0000";
}

/**
 * POSTs a transaction to the JSON service. Every request must carry the
 * X-MERCHANT-ID / X-TERMINAL-ID / X-POSNET-ID / X-CORRELATION-ID headers — the bank's
 * support team uses the correlation id to trace a failing order.
 */
export async function albarakaService(
  transactionType: string,
  body: Record<string, unknown>,
  opts: { correlationId: string; config?: AlbarakaConfig }
): Promise<AlbarakaServiceResponse> {
  const cfg = opts.config ?? albarakaConfig();
  const res = await fetch(`${cfg.serviceUrl}/${transactionType}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-MERCHANT-ID": cfg.merchantNo,
      "X-TERMINAL-ID": cfg.terminalNo,
      "X-POSNET-ID": cfg.posnetId,
      // Max 30 alphanumeric characters per the bank's spec.
      "X-CORRELATION-ID": opts.correlationId.replace(/[^A-Za-z0-9]/g, "").slice(0, 30),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as AlbarakaServiceResponse;
  } catch {
    return {
      ServiceResponseData: {
        ResponseCode: String(res.status),
        ResponseDescription: text.slice(0, 500) || "Malformed response from Albaraka",
      },
    };
  }
}

/**
 * MdStatus meanings from the bank's table. Only 1 is a real ("full 3D") pass; 2/3/4 are
 * "half 3D" (cardholder or issuer not enrolled) which the bank allows merchants to
 * continue on at their own risk. We stop on anything but 1, as the bank recommends.
 */
export function albarakaMdStatusMessage(mdStatus: string): string {
  const table: Record<string, string> = {
    "0": "Card verification failed",
    "1": "Verification successful",
    "2": "Cardholder or issuer not enrolled in 3D Secure",
    "3": "Card issuer not enrolled in 3D Secure",
    "4": "Verification attempted — cardholder chose to enrol later",
    "5": "Verification could not be performed",
    "6": "3D Secure error",
    "7": "System error",
    "8": "Unknown card number",
    "9": "Merchant is not registered for 3D Secure",
  };
  return table[mdStatus] ?? `Unknown 3D status (${mdStatus || "empty"})`;
}
