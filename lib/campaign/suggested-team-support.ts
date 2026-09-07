/**
 * Team-support quick-pick amounts (shown in DonationDialog & CartPaymentDialog).
 * Stored as JSON: { amounts: number[], byCurrency?: Record<string, number[]> }.
 *
 * Two layers:
 *   1. Global defaults (per currency) live on GlobalSettings.
 *   2. Per-campaign override on Campaign.suggestedTeamSupport. If null/empty,
 *      the global defaults apply.
 *
 * The "No thanks" option is rendered by the dialog itself and is NOT part of
 * the stored amounts list.
 */

export const DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS = [5, 10, 25, 50, 100];

export type SuggestedTeamSupportConfig = {
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

/**
 * Coerce DB / API JSON into a normalized config. Unlike suggested-donations,
 * an empty/missing input here returns *empty* amounts so callers can decide
 * whether to fall through to a deeper default (e.g. campaign → global → hardcoded).
 */
export function parseSuggestedTeamSupport(raw: unknown): SuggestedTeamSupportConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { amounts: [], byCurrency: {} };
  }
  const o = raw as Record<string, unknown>;
  return {
    amounts: normalizeAmountsArray(o.amounts),
    byCurrency: normalizeByCurrency(o.byCurrency),
  };
}

/** Amounts to use for the given currency code (cookie / selector). */
export function resolveTeamSupportAmountsForCurrency(
  config: SuggestedTeamSupportConfig,
  currencyCode: string
): number[] {
  const c = normalizeCode(currencyCode);
  if (c && c !== "DEFAULT" && config.byCurrency[c]?.length) {
    return config.byCurrency[c];
  }
  return config.amounts;
}

/**
 * Resolve the final amounts shown to the donor, walking the override chain:
 * campaign override → global default → hardcoded default.
 */
export function resolveFinalTeamSupportAmounts(
  currencyCode: string,
  campaignOverride?: SuggestedTeamSupportConfig | null,
  globalDefault?: SuggestedTeamSupportConfig | null
): number[] {
  if (campaignOverride) {
    const fromCampaign = resolveTeamSupportAmountsForCurrency(campaignOverride, currencyCode);
    if (fromCampaign.length) return fromCampaign;
  }
  if (globalDefault) {
    const fromGlobal = resolveTeamSupportAmountsForCurrency(globalDefault, currencyCode);
    if (fromGlobal.length) return fromGlobal;
  }
  return [...DEFAULT_SUGGESTED_TEAM_SUPPORT_AMOUNTS];
}

const MAX_AMOUNTS = 12;
const MAX_CURRENCY_OVERRIDES = 20;

/** Validate body from admin API; returns null to omit update, or object to persist. */
export function validateSuggestedTeamSupportBody(
  body: unknown,
  { requireAmounts = false }: { requireAmounts?: boolean } = {}
): SuggestedTeamSupportConfig | null {
  if (body === undefined) return null;
  if (body === null) {
    throw new Error("Invalid suggestedTeamSupport");
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid suggestedTeamSupport");
  }
  const o = body as Record<string, unknown>;
  const amounts = normalizeAmountsArray(o.amounts);
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
  if (requireAmounts && !amounts.length) {
    throw new Error("Provide at least one default amount");
  }
  return { amounts, byCurrency };
}
