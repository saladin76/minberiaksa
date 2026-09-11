/**
 * Shaping for the bank-account write endpoints.
 *
 * Parent row as a patch; the per-currency rows posted whole and replaced
 * atomically, as `playlist-write.ts` does for episodes.
 *
 * The schema is emphatic that nothing here is ever seeded, and the same
 * caution applies to what this module accepts: it normalises whitespace and
 * case in identifiers but never invents or corrects one. An IBAN is stored as
 * typed, upper-cased with spaces removed, and validated only for shape — the
 * dashboard cannot know whether an account exists, and a checksum pass would
 * imply a confidence the code does not have.
 */

import {
  boolDefaultTrue,
  intOr,
  localeList,
  optionalStr,
  parseTranslations,
  str,
} from "./translation-write";

export const BANK_ACCOUNT_WITH_CHILDREN_SELECT = {
  id: true,
  slug: true,
  name: true,
  branch: true,
  swift: true,
  holder: true,
  logo: true,
  locales: true,
  order: true,
  isActive: true,
  translations: { select: { locale: true, name: true, branch: true, holder: true } },
  currencies: {
    select: { id: true, code: true, accountNo: true, extNo: true, iban: true },
  },
} as const;

/** The bank's name decides presence; branch and holder ride along with it. */
export function parseBankAccountTranslations(translations: unknown) {
  return parseTranslations(translations, { required: "name", optional: ["branch", "holder"] });
}

/** Identifiers: trimmed, upper-cased, internal spaces removed. Empty → undefined. */
function identifier(v: unknown): string | undefined {
  const s = str(v).replace(/\s+/g, "").toUpperCase();
  return s || undefined;
}

export function buildBankAccountScalars(body: Record<string, unknown>) {
  return {
    slug: str(body.slug),
    name: str(body.name),
    branch: optionalStr(body.branch),
    swift: identifier(body.swift),
    holder: str(body.holder),
    logo: optionalStr(body.logo),
    locales: localeList(body.locales),
    order: intOr(body.order, 0),
    isActive: boolDefaultTrue(body.isActive),
  };
}

export function buildBankAccountScalarPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (body.slug !== undefined) patch.slug = str(body.slug);
  if (body.name !== undefined) patch.name = str(body.name);
  if (body.branch !== undefined) patch.branch = optionalStr(body.branch) ?? null;
  if (body.swift !== undefined) patch.swift = identifier(body.swift) ?? null;
  if (body.holder !== undefined) patch.holder = str(body.holder);
  if (body.logo !== undefined) patch.logo = optionalStr(body.logo) ?? null;
  if (body.locales !== undefined) patch.locales = localeList(body.locales);
  if (body.order !== undefined) patch.order = intOr(body.order, 0);
  if (body.isActive !== undefined) patch.isActive = boolDefaultTrue(body.isActive);
  return patch;
}

export interface BankCurrencyInput {
  code: string;
  accountNo?: string;
  extNo?: string;
  iban?: string;
}

/** ISO 4217 is three letters; anything else is a typo, not a currency. */
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * Currency rows as posted. A row is kept only if it names a valid currency
 * code AND carries at least one identifier — a bare code tells a donor nothing.
 * Duplicate codes keep the first; the same account does not hold USD twice.
 */
export function parseBankCurrencies(raw: unknown): BankCurrencyInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BankCurrencyInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const code = identifier(c.code) ?? "";
    if (!CURRENCY_CODE.test(code) || seen.has(code)) continue;
    const row: BankCurrencyInput = {
      code,
      accountNo: optionalStr(c.accountNo),
      extNo: optionalStr(c.extNo),
      iban: identifier(c.iban),
    };
    if (!row.accountNo && !row.extNo && !row.iban) continue;
    seen.add(code);
    out.push(row);
  }
  return out;
}
