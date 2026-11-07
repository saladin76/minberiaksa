import type { GoogleSearchClient, SearchRow } from "./client";

export async function requireConversionTracking(client: GoogleSearchClient) {
  const rows = await client.query("SELECT conversion_action.resource_name FROM conversion_action WHERE conversion_action.status = 'ENABLED' AND conversion_action.include_in_conversions_metric = TRUE LIMIT 1");
  if (!rows.length) throw new Error("CONVERSION_TRACKING_REQUIRED");
}
export function optimizationWindow(now: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(part => [part.type, part.value]));
  const today = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  const date = (days: number) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
  return { since: date(10), until: date(3), matureBefore: date(7), historySince: date(365), timezone: timeZone };
}

/** Group counts include enabled keywords with zero impressions. Unknown age never qualifies. */
export function selectKeywordsToPause(metrics: SearchRow[], enabled: SearchRow[], historical: SearchRow[], minimum: number, policy: { minClicks: number; maxKeywordCost: number }, matureBefore: string) {
  const counts = new Map<string, number>(), allowed = new Set<string>(), mature = new Set<string>();
  for (const row of enabled) {
    if (row.adGroupCriterion.status !== "ENABLED" || !row.adGroup?.resourceName) continue;
    allowed.add(row.adGroupCriterion.resourceName); counts.set(row.adGroup.resourceName, (counts.get(row.adGroup.resourceName) || 0) + 1);
  }
  for (const row of historical) if (row.segments?.date && row.segments.date <= matureBefore && Number(row.metrics.impressions) > 0) mature.add(row.adGroupCriterion.resourceName);
  const selected: SearchRow[] = [];
  for (const row of [...metrics].sort((a,b) => Number(b.metrics.costMicros) - Number(a.metrics.costMicros))) {
    const group = row.adGroup?.resourceName, resource = row.adGroupCriterion.resourceName;
    if (!allowed.has(resource) || !mature.has(resource) || !group || (counts.get(group) || 0) <= minimum ||
        Number(row.metrics.conversions) !== 0 || Number(row.metrics.clicks) < policy.minClicks || Number(row.metrics.costMicros) / 1e6 < policy.maxKeywordCost) continue;
    selected.push(row); allowed.delete(resource); counts.set(group, counts.get(group)! - 1);
    if (selected.length === 5) break;
  }
  return selected;
}

type Evidence = Record<string, unknown>;
export function optimizationHistory(evidence: Evidence): Evidence[] {
  const current = evidence.optimization as Evidence | undefined;
  const history = current && Array.isArray(current.history) ? current.history.filter((row): row is Evidence => Boolean(row && typeof row === "object" && !Array.isArray(row))) : [];
  // Retain the last pre-upgrade decision as well as every subsequent cycle.
  if (!history.length && current?.at && Array.isArray(current.pausedKeywords)) { const { history: _history, ...legacy } = current; void _history; return [legacy]; }
  return history;
}
export function appendOptimizationHistory(evidence: Evidence, cycle: Evidence) {
  const history = optimizationHistory(evidence);
  if (!history.some(item => item.runId && item.runId === cycle.runId)) history.push(cycle);
  return cycle.kind === "RESTORE" ? { ...((evidence.optimization || {}) as Evidence), history, lastRestoredAt: cycle.at } : { ...cycle, history };
}
