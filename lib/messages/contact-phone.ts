import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Reaching the sender on WhatsApp.
 *
 * Two problems to solve before the inbox can offer a wa.me link:
 *
 *  1. **Where the number lives.** `Message.contactPhone` only exists for messages sent after
 *     that column was added. Every earlier contact-form submission smuggled the number into the
 *     body as a trailing "Phone: +90…" line (see app/[locale]/contact-us/page.tsx), so the whole
 *     existing inbox would show no phone at all unless we keep parsing that shape.
 *  2. **Whether it can be dialled.** wa.me takes an E.164 number with no "+". A local number
 *     like "0538 030 8212" has no country in it — wa.me would read the leading 0 as the country
 *     code and open a chat with nobody. Rather than guess a country and send the admin to a dead
 *     conversation, an un-normalisable number is returned as display text only, and the inbox
 *     offers "copy" instead of "reply on WhatsApp".
 *
 * Server-side on purpose: libphonenumber-js carries its own metadata table and has no business
 * in the dashboard's client bundle. The API sends the resolved values down.
 */

/**
 * Matches the trailing "Phone: …" line the contact form used to append, plus the obvious
 * hand-typed variants. Anchored at the end of the body so it can only ever strip a trailer —
 * a number mentioned mid-message stays in the text where the reader expects it.
 */
const TRAILING_PHONE_RE =
  /\n[ \t]*(?:phone|tel|telephone|mobile|whats\s?app|هاتف|الهاتف|رقم الهاتف|جوال|واتساب|تليفون)[ \t]*[:：][ \t]*([+(]?\d[\d\s()+.\-]{5,24})[ \t]*$/i;

/** Splits the legacy trailer off a body. Returns the body untouched when there is none. */
export function splitTrailingPhone(body: string): { body: string; phone: string | null } {
  if (typeof body !== "string") return { body: "", phone: null };
  const match = body.match(TRAILING_PHONE_RE);
  if (!match) return { body, phone: null };
  return {
    body: body.slice(0, match.index).trimEnd(),
    phone: match[1].trim(),
  };
}

/**
 * E.164 digits suitable for wa.me, or null when the number cannot be resolved to a real one.
 *
 * `defaultCountry` is only consulted for numbers written without an international prefix; pass
 * the sender's known country (User.countryCode) when there is one, and nothing otherwise.
 */
export function toWhatsappNumber(
  raw: string | null | undefined,
  defaultCountry?: string | null,
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // "0090…" is the same number as "+90…" — the international access code, not a trunk prefix.
  const candidate = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const country =
    typeof defaultCountry === "string" && /^[A-Za-z]{2}$/.test(defaultCountry)
      ? (defaultCountry.toUpperCase() as CountryCode)
      : undefined;

  try {
    const parsed = parsePhoneNumberFromString(candidate, country);
    if (parsed?.isValid()) return parsed.number.replace("+", "");
  } catch {
    /* fall through to the digit check below */
  }

  // Not a number libphonenumber recognises. Accept it only if it already reads as an
  // international number: digits, no leading trunk zero, long enough to carry a country code.
  const digits = candidate.replace(/\D+/g, "");
  if (digits.length >= 10 && digits.length <= 15 && !digits.startsWith("0")) return digits;
  return null;
}

export type ResolvedContactPhone = {
  /** What to show the admin — the number as the sender wrote it. */
  phone: string | null;
  /** Bare E.164 digits for wa.me, or null when no reliable link can be built. */
  whatsapp: string | null;
};

/**
 * Picks the number to reach this sender on, most specific first: what they typed for this
 * message, then the legacy body trailer, then the phone on their account.
 */
export function resolveContactPhone(input: {
  contactPhone?: string | null;
  bodyPhone?: string | null;
  userPhone?: string | null;
  countryCode?: string | null;
}): ResolvedContactPhone {
  const phone =
    [input.contactPhone, input.bodyPhone, input.userPhone]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find((v) => v.length > 0) ?? null;

  return { phone, whatsapp: toWhatsappNumber(phone, input.countryCode) };
}
