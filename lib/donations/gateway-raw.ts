/**
 * A payment gateway's stored answer (`Donation.providerRaw`), flattened for the
 * dashboard's gateway popup.
 *
 * Anything that could be a card number, a CVV, an expiry, a key, a hash or a
 * signature is replaced with "••••" and never leaves the server. A value the
 * gateway already masked ("454360******1234") is the card's public trace and
 * is kept, since it is what the bank's own panel searches by.
 */

export type GatewayRawEntry = { path: string; value: string };

export const GATEWAY_RAW_MAX_ENTRIES = 250;

/* Matched per word, so camelCase (MerchantPass, clientSecret, HashData) and
   snake_case (card_number) are caught alike without matching "company" or "span". */
const SENSITIVE_WORDS = new Set([
  "pan", "cvv", "cvv2", "cvc", "cvn", "pin", "password", "pass", "passwd", "secret", "hash", "mac",
  "signature", "sign", "token", "key", "apikey", "storekey", "private", "expiry", "expiration", "exp",
  "expire", "expires", "otp", "auth3d",
]);
const SENSITIVE_JOINED = /cardnumber|cardno|creditcard|hashdata|merchantpass|clientsecret|accesskey/;
const MASKED_VALUE = /\*{3,}|X{4,}|•{2,}/;

export function isSensitiveGatewayKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.some((w) => SENSITIVE_WORDS.has(w))) return true;
  return SENSITIVE_JOINED.test(words.join(""));
}

function walk(value: unknown, path: string, out: GatewayRawEntry[], depth: number) {
  if (out.length >= GATEWAY_RAW_MAX_ENTRIES || value == null || value === "") return;
  if (typeof value !== "object") {
    const segments = path.split(".").map((s) => s.replace(/\[\d+\]$/, ""));
    const key = segments[segments.length - 1] ?? path;
    /* Inside a card object, its "number" and expiry are card data even though
       those words alone are harmless elsewhere. */
    const inCard = segments.slice(0, -1).some((s) => /card/i.test(s));
    const cardField = inCard && /^(number|exp_?month|exp_?year|cvc|cvv|security_?code)$/i.test(key);
    const text = String(value);
    const hide = (cardField || isSensitiveGatewayKey(key)) && !MASKED_VALUE.test(text);
    out.push({ path, value: hide ? "••••" : text.slice(0, 500) });
    return;
  }
  if (depth > 5) return;
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, i) => walk(item, `${path}[${i}]`, out, depth + 1));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    /* A whole object under a sensitive key (card: {...}) is dropped, not walked. */
    if (isSensitiveGatewayKey(key) && child != null && typeof child === "object") continue;
    walk(child, path ? `${path}.${key}` : key, out, depth + 1);
  }
}

export function flattenGatewayRaw(raw: unknown): { entries: GatewayRawEntry[]; truncated: boolean } {
  const entries: GatewayRawEntry[] = [];
  walk(raw, "", entries, 0);
  return { entries, truncated: entries.length >= GATEWAY_RAW_MAX_ENTRIES };
}
