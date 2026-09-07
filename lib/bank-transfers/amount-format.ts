/**
 * Number/text primitives shared by the statement parser and the column
 * detector. Kept in its own module so both can import them without a cycle.
 */

/**
 * Fold Turkish letters to ASCII and lowercase, so a header written "Tutarı",
 * "TUTARI", "Tutari" or "İşlem Tutarı" all compare equal.
 *
 * `toLowerCase()` alone is not enough: "TUTARI" lowercases to "tutari" but
 * "Tutarı" lowercases to "tutarı" (dotless ı), and the two never match.
 */
export function foldTurkish(value: string): string {
  return value
    .replace(/[İIı]/g, "i")
    .replace(/[Şş]/g, "s")
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CURRENCY_NOISE = /[₺$€£]|\b(?:TRY|TL|USD|EUR|GBP)\b/gi;
// Separate non-global copy: `.test()` on a /g regex advances `lastIndex` and so
// alternates true/false across calls.
const HAS_CURRENCY = /[₺$€£]|\b(?:TRY|TL|USD|EUR|GBP)\b/i;

/**
 * Parse a money cell into a number.
 *
 * Handles both conventions found in Turkish bank exports and in files that have
 * been round-tripped through an English locale:
 *   "1.234,56"  -> 1234.56   (TR: dot groups, comma decimal)
 *   "1,234.56"  -> 1234.56   (EN: comma groups, dot decimal)
 *   "1.234"     -> 1234      (three trailing digits => grouping, not decimals)
 *   "12,5"      -> 12.5
 *   "1.234,56-" -> -1234.56  (trailing minus, as Ziraat writes debits)
 *   "(1.234,56)"-> -1234.56
 *
 * The rule for which separator is the decimal one: when both appear, the LAST
 * occurrence wins; when only one appears, it is a decimal point only if it is
 * followed by exactly one or two digits at the end of the string.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;

  //   (non-breaking space) shows up in exports from Excel.
  let raw = String(value).replace(/[\s ]+/g, " ").trim();
  if (!raw) return null;

  raw = raw.replace(CURRENCY_NOISE, "").trim();

  // A trailing minus and parentheses both mean "negative" in bank exports.
  const negative = /^-/.test(raw) || /-$/.test(raw) || /^\(.*\)$/.test(raw);

  const digitsAndSeparators = raw.replace(/[^0-9.,]/g, "");
  if (!digitsAndSeparators || !/\d/.test(digitsAndSeparators)) return null;

  const lastDot = digitsAndSeparators.lastIndexOf(".");
  const lastComma = digitsAndSeparators.lastIndexOf(",");

  let decimalSep: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const pos = lastDot >= 0 ? lastDot : lastComma;
    const trailing = digitsAndSeparators.length - pos - 1;
    const onlyOne = digitsAndSeparators.indexOf(sep) === pos;
    // "1.234" (3 trailing digits) is grouping; "12.34" is a decimal.
    decimalSep = onlyOne && trailing >= 1 && trailing <= 2 ? sep : null;
  }

  let normalized: string;
  if (decimalSep) {
    const groupSep = decimalSep === "." ? "," : ".";
    normalized = digitsAndSeparators
      .split(groupSep).join("")
      .replace(decimalSep, ".");
  } else {
    normalized = digitsAndSeparators.replace(/[.,]/g, "");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Does this cell read like a monetary figure rather than a code or a counter?
 *
 * Used to score columns when the sheet has no usable header. Requiring a
 * decimal part, thousands grouping, or a currency marker is what keeps a
 * reference number like "20250114887" from being mistaken for an amount.
 */
export function looksLikeMoneyText(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (value === null || value === undefined) return false;
  const raw = String(value).replace(/[\s ]+/g, " ").trim();
  if (!raw) return false;
  if (HAS_CURRENCY.test(raw)) return parseAmount(raw) !== null;
  const body = raw.replace(/[()\-+]/g, "").trim();
  // "1.234,56" / "1,234.56" / "1234,56" / "1234.56" — a separator with 1–2
  // trailing digits, or explicit thousands grouping.
  return /^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(body) || /^\d+[.,]\d{1,2}$/.test(body);
}

/**
 * Reference numbers, account numbers, IBANs and card fragments — the values a
 * naive "first number in the row" scan used to pick up as the donation amount.
 */
export function looksLikeIdentifier(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const raw = String(value).replace(/[\s ]+/g, "").trim();
  if (!raw) return false;
  if (/^TR\d{20,24}$/i.test(raw)) return true;
  // A long unbroken digit run with no decimal part is an id, not money.
  if (/^\d{8,}$/.test(raw)) return true;
  // Mixed letters+digits (F1234567, 4A2B9C).
  if (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9\-_/]{4,}$/.test(raw)) return true;
  return false;
}
