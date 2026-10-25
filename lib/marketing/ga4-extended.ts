import { ga4DateRange, type Ga4Selection } from "./ga4-period";

export const GA4_BREAKDOWNS = {
  campaigns: { dimensions: ["sessionSourceMedium", "sessionCampaignName"], metrics: ["sessions", "activeUsers", "keyEvents", "engagementRate"] },
  landingPages: { dimensions: ["landingPage"], metrics: ["sessions", "activeUsers", "keyEvents", "bounceRate"] },
  events: { dimensions: ["eventName"], metrics: ["eventCount", "keyEvents"] },
  siteSearch: { dimensions: ["searchTerm"], metrics: ["eventCount", "activeUsers"] },
  campaignTerms: { dimensions: ["sessionManualTerm"], metrics: ["sessions", "keyEvents"] },
  interests: { dimensions: ["brandingInterest"], metrics: ["activeUsers", "sessions"] },
  browsers: { dimensions: ["browser", "deviceCategory"], metrics: ["sessions", "bounceRate"] },
} as const;
export type Ga4BreakdownKey = keyof typeof GA4_BREAKDOWNS;
export type Ga4Breakdown = { rows: { dimensions: string[]; metrics: number[] }[]; rowCount: number; thresholded: boolean; sampled: boolean; error?: string };
export type Ga4ExtendedReport = Partial<Record<Ga4BreakdownKey, Ga4Breakdown>>;

export async function fetchGa4Extended(options: { propertyId: string; accessToken: string; range: Ga4Selection; fetchImpl: typeof fetch }): Promise<Ga4ExtendedReport> {
  const result: Ga4ExtendedReport = {};
  // Isolate interest/demographic availability from the other reports.
  const groups: Ga4BreakdownKey[][] = [["campaigns", "landingPages", "events", "siteSearch", "campaignTerms"], ["interests"], ["browsers"]];
  await Promise.all(groups.map(async (keys) => {
    try {
      const requests = keys.map((key) => {
        const spec = GA4_BREAKDOWNS[key];
        return { dateRanges: [ga4DateRange(options.range)], dimensions: spec.dimensions.map((name) => ({ name })), metrics: spec.metrics.map((name) => ({ name })), orderBys: [{ metric: { metricName: spec.metrics[0] }, desc: true }], limit: "25" };
      });
      const response = await options.fetchImpl(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(options.propertyId)}:batchRunReports`, {
        method: "POST", headers: { authorization: `Bearer ${options.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ requests }), signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const payload = await response.json() as { reports?: Array<{ rows?: Array<{ dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }>; rowCount?: number; metadata?: { subjectToThresholding?: boolean; samplingMetadatas?: unknown[] } }> };
      for (const [index, key] of keys.entries()) {
        const report = payload.reports?.[index];
        if (!report) throw new Error("INCOMPLETE_REPORT");
        result[key] = { rows: (report.rows ?? []).map((row) => ({ dimensions: (row.dimensionValues ?? []).map((v) => v.value ?? ""), metrics: (row.metricValues ?? []).map((v) => Number.isFinite(Number(v.value)) ? Number(v.value) : 0) })), rowCount: report.rowCount ?? 0, thresholded: report.metadata?.subjectToThresholding === true, sampled: Boolean(report.metadata?.samplingMetadatas?.length) };
      }
    } catch (error) {
      for (const key of keys) result[key] = { rows: [], rowCount: 0, thresholded: false, sampled: false, error: error instanceof Error && /^HTTP_\d+$/.test(error.message) ? error.message : "UNAVAILABLE" };
    }
  }));
  return result;
}
