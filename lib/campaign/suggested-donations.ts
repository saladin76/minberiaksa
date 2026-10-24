/**
 * Campaign suggested quick-pick donation amounts (shown in DonationDialog).
 * `amounts` and `defaultAmountUSD` use USD as their base. `byCurrency` holds
 * manual local-currency values that override rate conversion for that currency.
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
  /** Suggested donation values in USD. */
  amounts: number[];
  byCurrency: Record<string, number[]>;
  /** Optional amount prefilled in the donation form, stored in USD. */
  defaultAmountUSD: number | null;
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

function normalizeDefaultAmount(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  // The donation form accepts whole amounts only. Keep the USD default in the
  // same shape so currency conversion cannot prefill a value the form truncates.
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Round converted options to whole, easy-to-read amounts for the selected currency. */
export function roundSuggestedDonationAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = value < 20 ? 1 : value < 100 ? 5 : value < 500 ? 10 : value < 2000 ? 50 : 100;
  return Math.max(1, Math.round(value / step) * step);
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
      defaultAmountUSD: null,
      cardAmounts: [],
    };
  }
  const o = raw as Record<string, unknown>;
  const parsed = normalizeAmountsArray(o.amounts);
  const amounts = parsed.length ? parsed : [...DEFAULT_SUGGESTED_DONATION_AMOUNTS];
  const byCurrency = normalizeByCurrency(o.byCurrency);
  return {
    amounts,
    byCurrency,
    defaultAmountUSD: normalizeDefaultAmount(o.defaultAmountUSD),
    cardAmounts: normalizeCardPicks(o.cardAmounts, amounts),
  };
}

/** Resolve USD presets to the selected currency, honoring manually entered overrides. */
export function resolveSuggestedAmountsForCurrency(
  config: SuggestedDonationsConfig,
  currencyCode: string,
  exchangeRates?: Record<string, number> | null,
): number[] {
  const c = normalizeCode(currencyCode);
  if (c && c !== "DEFAULT" && config.byCurrency[c]?.length) {
    return config.byCurrency[c];
  }
  const usdAmounts = config.amounts.length ? config.amounts : [...DEFAULT_SUGGESTED_DONATION_AMOUNTS];
  if (!c || c === "DEFAULT" || c === "USD") return usdAmounts;
  const rate = exchangeRates?.[c];
  if (!Number.isFinite(rate) || !rate || rate <= 0) return [];
  return [...new Set(usdAmounts.map((amount) => roundSuggestedDonationAmount(amount * rate)).filter(Boolean))];
}

/** The optional USD prefill is converted for the visitor without changing payment calculations. */
export function resolveDefaultDonationAmountForCurrency(
  config: SuggestedDonationsConfig,
  currencyCode: string,
  exchangeRates?: Record<string, number> | null,
): number | null {
  const baseAmount = config.defaultAmountUSD;
  if (baseAmount == null) return null;
  const c = normalizeCode(currencyCode);
  if (!c || c === "DEFAULT" || c === "USD") return baseAmount;
  const manual = config.byCurrency[c];
  const rate = exchangeRates?.[c];
  if (!Number.isFinite(rate) || !rate || rate <= 0) return null;
  const converted = roundSuggestedDonationAmount(baseAmount * rate);
  if (!converted) return null;
  if (!manual?.length) return converted;
  return manual.reduce((best, amount) => Math.abs(amount - converted) < Math.abs(best - converted) ? amount : best, manual[0]);
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
  const defaultAmountUSD = o.defaultAmountUSD == null || o.defaultAmountUSD === ""
    ? null
    : normalizeDefaultAmount(o.defaultAmountUSD);
  if (o.defaultAmountUSD != null && o.defaultAmountUSD !== "" && defaultAmountUSD == null) {
    throw new Error("Default donation amount must be a positive number in USD");
  }
  if (normalizeAmountsArray(o.cardAmounts).length > MAX_CARD_AMOUNTS) {
    throw new Error(`At most ${MAX_CARD_AMOUNTS} amounts on the campaign card`);
  }
  return { amounts, byCurrency, defaultAmountUSD, cardAmounts: normalizeCardPicks(o.cardAmounts, amounts) };
}
