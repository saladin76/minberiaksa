/**
 * Campaign suggested quick-pick donation amounts (shown in DonationDialog).
 * Stored as JSON: { amounts: number[], byCurrency?: Record<string, number[]>, cardAmounts?: number[] }.
 * If a currency has no override, `amounts` applies.
 *
 * `cardAmounts` are the (up to three) amounts the campaign card shows, picked
 * from `amounts`; the campaign page shows the whole list. Unset, the card shows
 * `DEFAULT_CARD_DONATION_AMOUNTS`.
 */

export const DEFAULT_SUGGESTED_DONATION_AMOUNTS = [10, 25, 50, 100, 250, 500];

/** What the campaign card offers when the dashboard has picked nothing. */
export const DEFAULT_CARD_DONATION_AMOUNTS = [100, 500, 1000];
export const MAX_CARD_AMOUNTS = 3;

export type SuggestedDonationsConfig = {
  amounts: number[];
  byCurrency: Record<string, number[]>;
  /** The card's picks from `amounts`; empty means the defaults. */
  cardAmounts: number[];
};

function normalizeCode(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase();
}

/** Parse comma/space-separated numbers from admin input. */
export function parseAmountsInput(input: string): number[] {
  if (!input || !String(input).trim()) return [];
  return String(input)
    .split(/[,،\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function normalizeAmountsArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === "number" ? x : Number(x);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

function normalizeByCurrency(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = normalizeCode(k);
    if (!code) continue;
    const arr = normalizeAmountsArray(v);
    if (arr.length) out[code] = arr;
  }
  return out;
}

/** Up to three distinct picks, in the order given, that are in `amounts`. */
function normalizeCardPicks(raw: unknown, amounts: readonly number[]): number[] {
  const picks = normalizeAmountsArray(raw).filter((n) => amounts.includes(n));
  return [...new Set(picks)].slice(0, MAX_CARD_AMOUNTS);
}

/** The amounts (USD) the campaign card shows. */
export function cardDonationAmounts(config: SuggestedDonationsConfig): number[] {
  return config.cardAmounts.length ? config.cardAmounts : [...DEFAULT_CARD_DONATION_AMOUNTS];
}

/** Coerce DB / API JSON into a normalized config (never empty amounts  use default). */
export function parseSuggestedDonations(raw: unknown): SuggestedDonationsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      amounts: [...DEFAULT_SUGGESTED_DONATION_AMOUNTS],
      byCurrency: {},
      cardAmounts: [],
    };
  }
  const o = raw as Record<string, unknown>;
  const parsed = normalizeAmountsArray(o.amounts);
  const amounts = parsed.length ? parsed : [...DEFAULT_SUGGESTED_DONATION_AMOUNTS];
  const byCurrency = normalizeByCurrency(o.byCurrency);
  return { amounts, byCurrency, cardAmounts: normalizeCardPicks(o.cardAmounts, amounts) };
}

/** Amounts to use for the given currency code (cookie / selector). */
export function resolveSuggestedAmountsForCurrency(
  config: SuggestedDonationsConfig,
  currencyCode: string
): number[] {
  const c = normalizeCode(currencyCode);
  if (c && c !== "DEFAULT" && config.byCurrency[c]?.length) {
    return config.byCurrency[c];
  }
  return config.amounts.length ? config.amounts : [...DEFAULT_SUGGESTED_DONATION_AMOUNTS];
}

const MAX_AMOUNTS = 12;
const MAX_CURRENCY_OVERRIDES = 20;

/** Validate body from admin API; returns null to omit update, or object to persist. */
export function validateSuggestedDonationsBody(body: unknown): SuggestedDonationsConfig | null {
  if (body === undefined) return null;
  if (body === null) {
    throw new Error("Invalid suggestedDonations");
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid suggestedDonations");
  }
  const o = body as Record<string, unknown>;
  let amounts = normalizeAmountsArray(o.amounts);
  if (amounts.length > MAX_AMOUNTS) {
    throw new Error(`At most ${MAX_AMOUNTS} suggested amounts`);
  }
  const byCurrency = normalizeByCurrency(o.byCurrency);
  const keys = Object.keys(byCurrency);
  if (keys.length > MAX_CURRENCY_OVERRIDES) {
    throw new Error(`At most ${MAX_CURRENCY_OVERRIDES} currency overrides`);
  }
  for (const arr of Object.values(byCurrency)) {
    if (arr.length > MAX_AMOUNTS) {
      throw new Error(`At most ${MAX_AMOUNTS} amounts per currency`);
    }
  }
  if (!amounts.length) {
    amounts = [...DEFAULT_SUGGESTED_DONATION_AMOUNTS];
  }
  if (normalizeAmountsArray(o.cardAmounts).length > MAX_CARD_AMOUNTS) {
    throw new Error(`At most ${MAX_CARD_AMOUNTS} amounts on the campaign card`);
  }
  return { amounts, byCurrency, cardAmounts: normalizeCardPicks(o.cardAmounts, amounts) };
}
