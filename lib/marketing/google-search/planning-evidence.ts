/** One bounded account summary is reused across language steps; the complete report stays in evidence. */
export function summarizePlanningReport(report: Record<string, unknown>) {
  const top = (rows: unknown) => Array.isArray(rows) ? [...rows].sort((a,b) => Number(b?.cost || 0) - Number(a?.cost || 0)).slice(0,50) : [];
  return { period: report.period, currency: report.currency, timezone: report.timezone, totals: report.totals,
    campaigns: top(report.campaigns), keywords: top(report.keywords), searchTerms: top(report.searchTerms), bounded: report.bounded === true };
}
export function parseSearchPlanJson(answer: string): unknown {
  const start = answer.indexOf("{"), end = answer.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI_PLAN_JSON_INVALID");
  try { return JSON.parse(answer.slice(start,end+1)); } catch { throw new Error("AI_PLAN_JSON_INVALID"); }
}
