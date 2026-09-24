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

/**
 * Nothing is defaulted, so readiness means all four identifiers are actually set —
 * and that the key is long enough to be a real one.
 *
 * The length floor matters more than it looks. "Non-empty" lets a placeholder like
 * `1` or `changeme` arm the live gateway: the dashboard offers Albaraka, the
 * checkout collects real cards, and every payment is then rejected by the bank for
 * a bad MAC *after* a donation row exists. Keys from "Anahtar Yaratma" are ~16
 * alphanumeric characters, so anything under 8 is a placeholder, not a short key.
 */
export const ALBARAKA_MIN_ENC_KEY_LENGTH = 8;

export function isAlbarakaConfigured(cfg: AlbarakaConfig = albarakaConfig()): boolean {
  return Boolean(
    cfg.encKey.trim().length >= ALBARAKA_MIN_ENC_KEY_LENGTH &&
      cfg.merchantNo &&
      cfg.terminalNo &&
      cfg.posnetId
  );
}

/**
 * Which currency Albaraka is asked to charge in.
 *
 *   TRY   — convert every donation to Turkish lira and charge TL.
 *   USD   — convert every donation to US dollars and charge US.
 *   DONOR — charge in the donor's own currency when the bank accepts it
 *           (TL/US/EU), converting everything else to TRY.
 *
 * The site takes 14 currencies but Albaraka understands only three codes, so
 * something always converts. This decides what to.
 */
export type AlbarakaChargeCurrency = "TRY" | "USD" | "DONOR";

/**
 * Reads ALBARAKA_CHARGE_CURRENCY, falling back to the older
 * ALBARAKA_MULTI_CURRENCY boolean so an existing deployment keeps its behaviour
 * until the new variable is set.
 *
 * Anything unrecognised resolves to TRY: the merchant account is Turkish, so
 * lira is the setting that is always accepted, and a typo should not send live
 * donations down a rail the bank may refuse.
 */
export function albarakaChargeCurrency(): AlbarakaChargeCurrency {
  const raw = String(process.env.ALBARAKA_CHARGE_CURRENCY ?? "").trim().toUpperCase();
  if (raw === "USD" || raw === "US") return "USD";
  if (raw === "DONOR") return "DONOR";
  if (raw === "TRY" || raw === "TL") return "TRY";
  return process.env.ALBARAKA_MULTI_CURRENCY === "1" ? "DONOR" : "TRY";
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

// ── Recurring (merchant-initiated) charges ───────────────────────────────────
//
// A recurring plan's first instalment is an ordinary 3D payment at checkout. Every
// later one is charged by the site's scheduler (`lib/donations/albaraka-recurring.ts`)
// through the bank's direct /Sale — the "Standart Satış" of the document — with the
// card the donor authorised, flagged `IsRecurring` / `IsMailOrder` so the bank treats
// it as a merchant-initiated transaction on a stored credential.
//
// Two things the document states, and this depends on:
//   - Non-3D sales need a Non-3D (mail-order) terminal, which the bank provisions
//     separately from the 3D one; its numbers go in ALBARAKA_RECURRING_TERMINAL_NO /
//     ALBARAKA_RECURRING_POSNET_ID (falling back to the 3D terminal's).
//   - The field table marks Cvc2 as required for a standard sale, and CVCs are never
//     stored here. Recurring transactions are sent without it, as merchant-initiated
//     transactions are; the bank must have enabled that on the terminal. Until it
//     has, ALBARAKA_RECURRING_ENABLED stays unset and no scheduler charge is made.

export type AlbarakaRecurringConfig = AlbarakaConfig & {
  /** Master switch: nothing is charged by the scheduler while this is off. */
  enabled: boolean;
};

export function albarakaRecurringConfig(): AlbarakaRecurringConfig {
  const base = albarakaConfig();
  return {
    ...base,
    terminalNo: process.env.ALBARAKA_RECURRING_TERMINAL_NO ?? base.terminalNo,
    posnetId: process.env.ALBARAKA_RECURRING_POSNET_ID ?? base.posnetId,
    enabled: process.env.ALBARAKA_RECURRING_ENABLED === "1",
  };
}

export function isAlbarakaRecurringEnabled(cfg: AlbarakaRecurringConfig = albarakaRecurringConfig()): boolean {
  return cfg.enabled && isAlbarakaConfigured(cfg);
}

/**
 * Non-3D orders are exactly 24 characters. The scheduler derives them from the plan
 * and the cycle it is charging (`albarakaRecurringOrderId`), so a re-run for the same
 * cycle produces the same id and the bank's own "ORDERID DAHA ONCE KULLANILMIS"
 * refusal becomes a second line of defence against a double charge.
 */
export function albarakaRecurringOrderId(subscriptionId: string, cycleIso: string, attempt: number): string {
  return crypto
    .createHash("sha256")
    .update(`${subscriptionId}:${cycleIso}:${attempt}`, "utf8")
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();
}

/**
 * Saved cards keep their expiry as "MM/YY"; the bank wants "YYMM" ("2612" =
 * December 2026). Empty when the stored value is not a four-digit date.
 */
export function albarakaExpiryFromStored(stored: string): string {
  const digits = String(stored || "").replace(/\D/g, "");
  if (digits.length !== 4) return "";
  return `${digits.slice(2, 4)}${digits.slice(0, 2)}`;
}

/**
 * A card is usable through the last day of its expiry month. Checked before a
 * scheduled charge so an expired card fails the plan with a clear reason
 * instead of a bank decline — and, per `DONATION_LOGIC_SPEC` § 1.3, is the
 * hook for the "update your card" notice a week ahead.
 */
export function isStoredCardExpired(stored: string, now: Date = new Date()): boolean {
  const digits = String(stored || "").replace(/\D/g, "");
  if (digits.length !== 4) return true;
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2, 4));
  if (!(month >= 1 && month <= 12)) return true;
  // First instant of the month after expiry, in UTC — the card is dead from then.
  const firstInvalid = Date.UTC(year, month, 1);
  return now.getTime() >= firstInvalid;
}

/** MACParams the document lists for a standard (non-3D) sale. */
export const ALBARAKA_NON_SECURE_MAC_PARAMS = "MerchantNo:TerminalNo:CardNo:Cvc2:ExpireDate:Amount";

/**
 * MAC for a standard /Sale — same construction as the 3D payment MAC (plain SHA256
 * over the values concatenated without separators, key appended), over the six
 * parameters the document's MACParams names for it. An absent Cvc2 takes part as
 * an empty string, the way absent fields do in every other MAC of this API.
 */
export function albarakaNonSecureSaleMac(
  params: { merchantNo: string; terminalNo: string; cardNo: string; cvc2: string; expireDate: string; amount: number },
  encKey: string
): string {
  return sha256Base64(
    params.merchantNo + params.terminalNo + params.cardNo + params.cvc2 + params.expireDate + String(params.amount) + encKey
  );
}

/**
 * The /Sale body for one scheduled charge. Pure, so the tests can pin the shape
 * without a bank: the card is a stored credential, so it carries no Cvc2, and the
 * transaction is declared recurring and mail-order (the bank's own terms for a
 * merchant-initiated charge without the cardholder present).
 */
export function buildAlbarakaRecurringSale(
  input: {
    orderId: string;
    amount: number;
    currencyCode: AlbarakaCurrencyCode;
    card: { number: string; expireDate: string; holderName: string };
  },
  cfg: AlbarakaRecurringConfig
): Record<string, unknown> {
  const mac = albarakaNonSecureSaleMac(
    {
      merchantNo: cfg.merchantNo,
      terminalNo: cfg.terminalNo,
      cardNo: input.card.number,
      cvc2: "",
      expireDate: input.card.expireDate,
      amount: input.amount,
    },
    cfg.encKey
  );
  return {
    ApiType: "JSON",
    ApiVersion: "V100",
    MerchantNo: cfg.merchantNo,
    TerminalNo: cfg.terminalNo,
    PaymentInstrumentType: "CARD",
    IsEncrypted: "N",
    IsTDSecureMerchant: "N",
    IsMailOrder: "Y",
    IsRecurring: "Y",
    CardInformationData: {
      CardHolderName: input.card.holderName,
      CardNo: input.card.number,
      Cvc2: "",
      ExpireDate: input.card.expireDate,
    },
    ThreeDSecureData: null,
    MAC: mac,
    MACParams: ALBARAKA_NON_SECURE_MAC_PARAMS,
    Amount: String(input.amount),
    CurrencyCode: input.currencyCode,
    PointAmount: 0,
    OrderId: input.orderId,
    InstallmentCount: "0",
    InstallmentType: "N",
  };
}
