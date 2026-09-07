/**
 * Campaign goal & fundraising mode (open goal, سهوم / share-based).
 */

export const GOAL_TYPE_FIXED = "FIXED";
export const GOAL_TYPE_OPEN = "OPEN";
export const FUNDRAISING_AMOUNT = "AMOUNT";
export const FUNDRAISING_SHARES = "SHARES";

export function normalizeGoalType(v: unknown): string {
  return v === GOAL_TYPE_OPEN ? GOAL_TYPE_OPEN : GOAL_TYPE_FIXED;
}

export function normalizeFundraisingMode(v: unknown): string {
  return v === FUNDRAISING_SHARES ? FUNDRAISING_SHARES : FUNDRAISING_AMOUNT;
}

export function showCampaignProgress(goalType: string): boolean {
  return normalizeGoalType(goalType) !== GOAL_TYPE_OPEN;
}

/** Percent for progress UI; 0 when open goal or invalid target. */
export function computeCampaignProgressPercent(
  currentAmount: number,
  targetAmount: number,
  goalType: string
): number {
  if (!showCampaignProgress(goalType)) return 0;
  const t = Number(targetAmount);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.min(100, (Number(currentAmount) / t) * 100);
}

export type SuggestedShareCountsConfig = {
  counts: number[];
  /** Per-currency overrides for the share price, stored as the absolute price in that currency (not USD). */
  priceByCurrency?: Record<string, number>;
};

export const DEFAULT_SUGGESTED_SHARE_COUNTS = [1, 2, 3, 4, 5, 10];

function normalizeCountsArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === "number" ? x : Number(x);
    if (Number.isFinite(n) && n >= 1 && n <= 1_000_000) out.push(Math.floor(n));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function normalizeCurrencyCode(code: string): string {
  return String(code || "").trim().toUpperCase();
}

function normalizePriceByCurrency(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = normalizeCurrencyCode(k);
    if (!code) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out[code] = n;
  }
  return out;
}

export function parseSuggestedShareCounts(raw: unknown): SuggestedShareCountsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { counts: [...DEFAULT_SUGGESTED_SHARE_COUNTS], priceByCurrency: {} };
  }
  const o = raw as Record<string, unknown>;
  const counts = normalizeCountsArray(o.counts);
  const priceByCurrency = normalizePriceByCurrency(o.priceByCurrency);
  return {
    counts: counts.length ? counts : [...DEFAULT_SUGGESTED_SHARE_COUNTS],
    priceByCurrency,
  };
}

/**
 * Resolve the display price of one share for the given currency.
 * When an override exists, returns { price, isOverride: true } — callers should
 * display this value as-is and convert to USD for the server via the exchange rate.
 * Otherwise returns null, meaning the caller should convert sharePriceUSD normally.
 */
export function resolveSharePriceOverride(
  config: SuggestedShareCountsConfig | null | undefined,
  currencyCode: string
): number | null {
  if (!config?.priceByCurrency) return null;
  const c = normalizeCurrencyCode(currencyCode);
  const v = c ? config.priceByCurrency[c] : undefined;
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : null;
}

const MAX_COUNTS = 12;
const MAX_PRICE_OVERRIDES = 20;

export function validateSuggestedShareCountsBody(
  body: unknown
): SuggestedShareCountsConfig | null {
  if (body === undefined) return null;
  if (body === null) throw new Error("Invalid suggestedShareCounts");
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid suggestedShareCounts");
  }
  const o = body as Record<string, unknown>;
  let counts = normalizeCountsArray(o.counts);
  if (counts.length > MAX_COUNTS) {
    throw new Error(`At most ${MAX_COUNTS} suggested share counts`);
  }
  const priceByCurrency = normalizePriceByCurrency(o.priceByCurrency);
  if (Object.keys(priceByCurrency).length > MAX_PRICE_OVERRIDES) {
    throw new Error(`At most ${MAX_PRICE_OVERRIDES} share price overrides`);
  }
  if (!counts.length) counts = [...DEFAULT_SUGGESTED_SHARE_COUNTS];
  return { counts, priceByCurrency };
}
