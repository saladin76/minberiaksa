/**
 * Campaign suggested quick-pick donation amounts (shown in DonationDialog).
 * Stored as JSON: { amounts: number[], byCurrency?: Record<string, number[]> }.
 * If a currency has no override, `amounts` applies.
 */

export const DEFAULT_SUGGESTED_DONATION_AMOUNTS = [10, 25, 50, 100, 250, 500];

export type SuggestedDonationsConfig = {
  amounts: number[];
  byCurrency: Record<string, number[]>;
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

/** Coerce DB / API JSON into a normalized config (never empty amounts — use default). */
export function parseSuggestedDonations(raw: unknown): SuggestedDonationsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      amounts: [...DEFAULT_SUGGESTED_DONATION_AMOUNTS],
      byCurrency: {},
    };
  }
  const o = raw as Record<string, unknown>;
  const amounts = normalizeAmountsArray(o.amounts);
  const byCurrency = normalizeByCurrency(o.byCurrency);
  return {
    amounts: amounts.length ? amounts : [...DEFAULT_SUGGESTED_DONATION_AMOUNTS],
    byCurrency,
  };
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
  return { amounts, byCurrency };
}
