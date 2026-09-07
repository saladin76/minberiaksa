/**
 * Works out, ONCE per sheet, which column holds what.
 *
 * The parser used to answer that question per row with a single
 * `headers.findIndex(h => keywords.some(k => h.includes(k)))`. That has two
 * failure modes which together are why imported amounts came out wrong:
 *
 *  1. It returns the first header matching ANY keyword, not the best match. A
 *     sheet whose columns are «… | Bakiye Tutarı | Tutar |» resolved to the
 *     running-balance column, because "Bakiye Tutarı" contains "tutar" and
 *     comes first — so every row imported the account balance as the donation.
 *  2. When no header matched, the fallback took the first number anywhere in
 *     the row, which is routinely a reference or account number.
 *
 * So: an explicit priority order with an exclusion list (the user's rule —
 * prefer the «Tutar» column when the sheet has one), and when there is no
 * usable header, column profiling over the actual data instead of a per-row
 * guess.
 */

import {
  foldTurkish,
  looksLikeIdentifier,
  looksLikeMoneyText,
  parseAmount,
} from "./amount-format";

export type ResolvedColumns = {
  date: number;
  description: number;
  donor: number;
  reference: number;
  /** Signed transaction amount (a «Tutar»-style single column). */
  amount: number;
  /** Incoming-only column (a «Alacak»-style pair). */
  credit: number;
  /** Outgoing-only column (a «Borç»-style pair). */
  debit: number;
  /** How `amount` was found — surfaced to the dashboard so the admin can see it. */
  amountSource: "header:tutar" | "header:credit" | "header:amount" | "detected" | "none";
  /** The header text the amount was taken from, when there was one. */
  amountHeader: string | null;
};

export const NO_COLUMNS: ResolvedColumns = {
  date: -1, description: -1, donor: -1, reference: -1,
  amount: -1, credit: -1, debit: -1,
  amountSource: "none", amountHeader: null,
};

/**
 * Headers that must never be taken as the transaction amount even though they
 * contain an amount-ish word. «Bakiye» (balance) is the dangerous one: it is
 * numerically plausible on every row, so a wrong pick is silent.
 */
const AMOUNT_EXCLUDE = [
  "bakiye", "balance", "الرصيد", "رصيد",
  "kur", "oran", "rate",
  "komisyon", "masraf", "ucret", "vergi", "bsmv", "fee", "commission",
  "iban", "hesap no", "hesap numarasi", "musteri no", "sube", "kart no",
  "dekont", "fis no", "sira", "no.",
];

/**
 * Priority order for the amount column. The first group that matches wins, so
 * a sheet containing both «Tutar» and «Alacak» uses «Tutar».
 */
const AMOUNT_GROUPS: { tokens: string[]; source: ResolvedColumns["amountSource"] }[] = [
  // The user's rule: «Tutarı» / «Tutar» / «İşlem Tutarı» / «Tutar (TL)».
  { tokens: ["tutar"], source: "header:tutar" },
  { tokens: ["alacak"], source: "header:credit" },
  { tokens: ["gelen", "yatan", "deposit", "credit"], source: "header:credit" },
  { tokens: ["amount", "مبلغ", "دائن", "وارد"], source: "header:amount" },
];

const DEBIT_TOKENS = ["borc", "debit", "giden", "cikan", "withdrawal", "مدين", "صادر"];
const DATE_TOKENS = ["tarih", "date", "تاريخ", "valor"];
const DESC_TOKENS = ["aciklama", "description", "detay", "detail", "الوصف", "بيان", "شرح"];
const DONOR_TOKENS = ["gonderen", "sender", "ad soyad", "adi soyadi", "unvan", "donor", "المرسل", "اسم"];
const REF_TOKENS = ["referans", "reference", "fis", "islem no", "dekont", "transaction id", "رقم العملية", "مرجع"];

function isExcludedForAmount(header: string): boolean {
  return AMOUNT_EXCLUDE.some((token) => header.includes(token));
}

/** First header containing any of `tokens`, ignoring already-claimed columns. */
function matchHeader(headers: string[], tokens: string[], claimed: Set<number>): number {
  for (let i = 0; i < headers.length; i += 1) {
    if (claimed.has(i) || !headers[i]) continue;
    if (tokens.some((t) => headers[i].includes(t))) return i;
  }
  return -1;
}

type ColumnProfile = {
  index: number;
  values: (number | null)[];
  moneyRatio: number;
  parsedRatio: number;
  identifierRatio: number;
  distinct: number;
  nonZero: number;
};

function profileColumns(dataRows: unknown[][], width: number): ColumnProfile[] {
  const profiles: ColumnProfile[] = [];
  for (let col = 0; col < width; col += 1) {
    const values: (number | null)[] = [];
    let filled = 0;
    let money = 0;
    let parsed = 0;
    let identifiers = 0;
    const seen = new Set<number>();
    let nonZero = 0;

    for (const row of dataRows) {
      const cell = row[col];
      const text = cell === null || cell === undefined ? "" : String(cell).trim();
      if (!text) { values.push(null); continue; }
      filled += 1;
      if (looksLikeIdentifier(cell)) { identifiers += 1; values.push(null); continue; }
      if (looksLikeMoneyText(cell)) money += 1;
      const n = parseAmount(cell);
      values.push(n);
      if (n !== null) {
        parsed += 1;
        seen.add(n);
        if (Math.abs(n) > 0) nonZero += 1;
      }
    }

    profiles.push({
      index: col,
      values,
      moneyRatio: filled ? money / filled : 0,
      parsedRatio: filled ? parsed / filled : 0,
      identifierRatio: filled ? identifiers / filled : 0,
      distinct: seen.size,
      nonZero,
    });
  }
  return profiles;
}

/**
 * Is `candidate` a running balance of `movement`? A balance column satisfies
 * `balance[i] - balance[i-1] === movement[i]` on most consecutive rows. Catching
 * this is what stops the balance being imported as the donation when the sheet
 * has no header at all.
 */
function isRunningBalanceOf(candidate: ColumnProfile, movement: ColumnProfile): boolean {
  let checked = 0;
  let agree = 0;
  for (let i = 1; i < candidate.values.length; i += 1) {
    const prev = candidate.values[i - 1];
    const cur = candidate.values[i];
    const step = movement.values[i];
    if (prev === null || cur === null || step === null) continue;
    checked += 1;
    if (Math.abs(cur - prev - step) < 0.011 || Math.abs(cur - prev + step) < 0.011) agree += 1;
  }
  return checked >= 3 && agree / checked >= 0.6;
}

/**
 * Pick the amount column from the data itself. Used when the sheet has no
 * header row, or its header carries no recognisable amount label.
 */
export function detectAmountColumn(
  dataRows: unknown[][],
  exclude: Set<number> = new Set()
): number {
  const width = dataRows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!width) return -1;

  const profiles = profileColumns(dataRows, width).filter(
    (p) =>
      !exclude.has(p.index) &&
      p.parsedRatio >= 0.6 &&
      p.identifierRatio < 0.3 &&
      p.nonZero >= 1 &&
      // A column of one repeated value is a currency/branch code, not an amount.
      p.distinct > 1
  );
  if (!profiles.length) return -1;

  // Money-shaped cells (a decimal part or thousands grouping) are the strongest
  // signal; break ties toward the column with more distinct non-zero values.
  const ranked = [...profiles].sort(
    (a, b) => b.moneyRatio - a.moneyRatio || b.distinct - a.distinct || a.index - b.index
  );

  const best = ranked[0];
  const balanceOf = ranked.find((other) => other.index !== best.index && isRunningBalanceOf(best, other));
  if (balanceOf) {
    // `best` turned out to be the balance; the column it tracks is the movement.
    return balanceOf.index;
  }
  return best.index;
}

/**
 * Resolve every column for a sheet. `headers` may be undefined when no header
 * row was found — detection then runs purely on the data.
 */
export function resolveStatementColumns(
  headers: string[] | undefined,
  dataRows: unknown[][]
): ResolvedColumns {
  const folded = (headers ?? []).map((h) => foldTurkish(h));
  const claimed = new Set<number>();

  const date = matchHeader(folded, DATE_TOKENS, claimed);
  if (date >= 0) claimed.add(date);
  const description = matchHeader(folded, DESC_TOKENS, claimed);
  if (description >= 0) claimed.add(description);
  const donor = matchHeader(folded, DONOR_TOKENS, claimed);
  if (donor >= 0) claimed.add(donor);
  const reference = matchHeader(folded, REF_TOKENS, claimed);
  if (reference >= 0) claimed.add(reference);

  // Amount candidates skip excluded headers entirely, so «Bakiye Tutarı» can
  // never win the "tutar" group.
  const amountEligible = folded.map((h) => (h && !isExcludedForAmount(h) ? h : ""));
  let amount = -1;
  let amountSource: ResolvedColumns["amountSource"] = "none";
  let amountHeader: string | null = null;
  for (const group of AMOUNT_GROUPS) {
    const hit = matchHeader(amountEligible, group.tokens, claimed);
    if (hit >= 0) {
      amount = hit;
      amountSource = group.source;
      amountHeader = headers?.[hit] ?? null;
      break;
    }
  }

  const debit = matchHeader(amountEligible, DEBIT_TOKENS, new Set([...claimed, amount].filter((i) => i >= 0)));

  // Nothing usable in the header: profile the data.
  if (amount < 0) {
    const skip = new Set<number>([date, description, donor, reference, debit].filter((i) => i >= 0));
    const detected = detectAmountColumn(dataRows, skip);
    if (detected >= 0) {
      amount = detected;
      amountSource = "detected";
      amountHeader = headers?.[detected] ?? null;
    }
  }

  // When the amount came from an «Alacak»-style header there is usually a
  // matching «Borç» column; a «Tutar» column is already signed and needs none.
  const credit = amountSource === "header:credit" ? amount : -1;

  return {
    date,
    description,
    donor,
    reference,
    amount,
    credit,
    debit,
    amountSource,
    amountHeader,
  };
}

/**
 * Locate the header row.
 *
 * The old check accepted the first row matching /date|tarih|.../ anywhere in its
 * text, so a preamble line like "Rapor Tarihi: 01.01.2026" was taken as the
 * header — after which no column resolved and every amount fell through to the
 * first-number-in-the-row guess. Requiring two distinct label hits across
 * separate cells, and scoring candidates instead of taking the first, keeps the
 * preamble out.
 */
export function findHeaderRow(rows: unknown[][], searchLimit = 30): number {
  const LABEL_GROUPS = [DATE_TOKENS, DESC_TOKENS, DONOR_TOKENS, REF_TOKENS, DEBIT_TOKENS, ["tutar", "alacak", "amount", "مبلغ"]];

  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < Math.min(rows.length, searchLimit); i += 1) {
    const cells = (rows[i] ?? []).map((c) => (c === null || c === undefined ? "" : foldTurkish(String(c))));
    const filled = cells.filter(Boolean);
    if (filled.length < 2) continue;

    // A header row is labels, not data: a row that is mostly numbers is not it.
    const numericCells = filled.filter((c) => parseAmount(c) !== null).length;
    if (numericCells > filled.length / 2) continue;

    let score = 0;
    for (const group of LABEL_GROUPS) {
      if (filled.some((cell) => group.some((token) => cell.includes(token)))) score += 1;
    }
    // Two distinct label families is the bar — "Tarih" alone is a preamble.
    if (score >= 2 && score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}
