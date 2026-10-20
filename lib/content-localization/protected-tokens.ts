/**
 * The QA gate on machine translation: a translation is only accepted when every value that must
 * survive verbatim  URLs, email addresses, `{{placeholders}}` / `{icu}` variables, HTML tags,
 * currency codes and numbers  is still there.
 *
 * It compares *values*, not spellings. The earlier check compared the raw matches and rejected
 * correct translations wholesale:
 *  - Arabic-Indic digits (١٠٠) are not `\d`, so the source had no number and the translation's
 *    `100` looked invented;
 *  - locales format the same number differently  `1,000` / `1.000` / `1 000`, `50%` / `%50`,
 *    `$100` / `100 $`;
 *  - a URL followed by a full stop picked the stop up on one side only.
 * A protected value that is missing or altered still fails; a translation may add a number the
 * source spelled out in words.
 */

/** Every non-ASCII digit system the source or a target locale may use, mapped to ASCII. */
const DIGIT_BLOCKS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0xff10];

export function normalizeDigits(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    const block = DIGIT_BLOCKS.find((start) => code >= start && code <= start + 9);
    if (block !== undefined) out += String(code - block);
    else if (code === 0x066b) out += "."; // Arabic decimal separator
    else if (code === 0x066c) out += ","; // Arabic thousands separator
    else out += ch;
  }
  return out;
}

const URL_RE = /https?:\/\/[^\s<>"')]+/giu;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const MUSTACHE_RE = /\{\{\s*([^{}]+?)\s*\}\}/gu;
const ICU_VARIABLE_RE = /(?<!\{)\{([A-Za-z0-9_.-]+)(?=[,}])/gu;
const HTML_TAG_RE = /<(\/?)([A-Za-z][A-Za-z0-9]*)\b[^>]*>/gu;
const CURRENCY_RE = /\b(?:USD|EUR|TRY|SAR|AED|QAR|KWD|JOD|GBP)\b/giu;
/* A number with optional grouping (`,` `.` `'` thin/normal space between 3-digit groups) and an
   optional decimal part. Its value is its digits; separators are formatting. */
const RELIGIOUS_TEXT_RE = /﴿[^﴿﴾]+﴾/gu;
const NUMBER_RE = /\d+(?:[.,'’   ]\d{3})*(?:[.,]\d+)?/gu;

/** The protected values of a text, as a sorted multiset of canonical strings. */
export function protectedTokens(value: string): string[] {
  let text = normalizeDigits(value);
  const tokens: string[] = [];
  const take = (re: RegExp, canonical: (m: RegExpMatchArray) => string) => {
    text = text.replace(re, (...args) => {
      const match = args.slice(0, -2) as unknown as RegExpMatchArray;
      tokens.push(canonical(match));
      return " ";
    });
  };
  /* URLs and emails first, so the digits inside them are not counted again as numbers. */
  take(RELIGIOUS_TEXT_RE, (m) => `religious:${m[0]}`);
  take(URL_RE, (m) => `url:${m[0].replace(/[.,;:!?]+$/u, "")}`);
  take(EMAIL_RE, (m) => `email:${m[0].toLowerCase()}`);
  take(MUSTACHE_RE, (m) => `var:{{${m[1]}}}`);
  take(ICU_VARIABLE_RE, (m) => `var:{${m[1]}}`);
  take(HTML_TAG_RE, (m) => `tag:<${m[1]}${m[2].toLowerCase()}>`);
  take(CURRENCY_RE, (m) => `cur:${m[0].toUpperCase()}`);
  take(NUMBER_RE, (m) => `num:${m[0].replace(/\D/gu, "")}`);
  return tokens.sort();
}

/** True when every protected value of `source` appears in `translated` at least as often. */
export function protectedTokensPreserved(source: string, translated: string): boolean {
  return missingProtectedTokens(source, translated).length === 0;
}

/** The protected values of `source` the translation lost, so the warning can say which. */
export function missingProtectedTokens(source: string, translated: string): string[] {
  const available = new Map<string, number>();
  for (const token of protectedTokens(translated)) available.set(token, (available.get(token) ?? 0) + 1);
  const missing: string[] = [];
  for (const token of protectedTokens(source)) {
    const left = available.get(token) ?? 0;
    if (left === 0) missing.push(token.slice(token.indexOf(":") + 1));
    else available.set(token, left - 1);
  }
  return missing;
}
