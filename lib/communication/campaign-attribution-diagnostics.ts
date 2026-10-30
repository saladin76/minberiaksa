/** Administrator diagnostics contain only fixed stages and reasons, never database messages. */
export const ATTRIBUTION_READ_STAGES = ["DONATIONS", "TRACKING_LINKS", "CAMPAIGNS", "EMAIL_HISTORY", "TEMPLATE_VARIANTS"] as const;
type AttributionReadStage = typeof ATTRIBUTION_READ_STAGES[number];

class AttributionReadError extends Error {
  constructor(readonly stage: AttributionReadStage, cause: unknown) {
    super("CAMPAIGN_ATTRIBUTION_READ_FAILED", { cause });
  }
}

export async function readAttributionStage<T>(stage: AttributionReadStage, work: () => PromiseLike<T>): Promise<T> {
  try { return await work(); } catch (cause) { throw new AttributionReadError(stage, cause); }
}

export function campaignAttributionDiagnostic(error: unknown) {
  const stage = error instanceof AttributionReadError ? error.stage : "REPORT";
  const cause = error instanceof AttributionReadError ? error.cause : error;
  const record = cause && typeof cause === "object" ? cause as { code?: unknown; message?: unknown; meta?: { message?: unknown } } : {};
  const code = typeof record.code === "string" && /^P\d{4}$/.test(record.code) ? record.code : null;
  const message = [record.message, record.meta?.message].filter(value => typeof value === "string").join(" ");
  const reason = code === "P2023" ? "QUERY_OPTIONS_INVALID"
    : code === "P2032" ? "LEGACY_VALUE_INVALID"
    : /INCOMPLETE|INVALID_PAGE|INVALID_ID|INVALID_ORDER|CURSOR_STALLED/.test(message) ? "SCAN_INCOMPLETE"
    : /time limit|timed? ?out|maxTimeMS|MaxTimeMSExpired|execution exceeded/i.test(message) ? "DATABASE_TIMEOUT"
    : code && ["P1001", "P1002", "P1017"].includes(code) ? "DATABASE_UNAVAILABLE"
    : "READ_FAILED";
  return { stage, reason, code };
}
