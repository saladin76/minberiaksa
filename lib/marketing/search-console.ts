import type { Ga4Period } from "./ga4-period";
export type SearchConsoleReport = {
  status: "ready" | "property_unavailable" | "access_denied" | "unavailable";
  property?: string; startDate?: string; endDate?: string; timezone: "America/Los_Angeles";
  summary?: { clicks: number; impressions: number; ctr: number; position: number };
  rows: { query: string; pagePath: string; clicks: number; impressions: number; ctr: number; position: number }[];
};
export function searchConsoleDates(period: Ga4Period, now = new Date()) {
  if (period.range === "custom") return {startDate: period.startDate!, endDate: period.endDate!};
  const parts = new Intl.DateTimeFormat("en-US", {timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(now);
  const part = (type: string) => parts.find((row) => row.type === type)!.value;
  const today = new Date(`${part("year")}-${part("month")}-${part("day")}T12:00:00Z`);
  const ago = (days: number) => new Date(today.getTime() - days * 86400000).toISOString().slice(0,10);
  return period.range === "today" ? {startDate: ago(0), endDate: ago(0)} : period.range === "yesterday" ? {startDate: ago(1), endDate: ago(1)} : {startDate: ago(Number(period.range.slice(0,-1))), endDate: ago(1)};
}

/** Use the same service identity, only for a matching property it can already read. */
export async function fetchSearchConsole(options: { accessToken: string; origin: string; period: Ga4Period; property?: string; fetchImpl?: typeof fetch }): Promise<SearchConsoleReport> {
  const base: SearchConsoleReport = {status: "unavailable", rows: [], timezone: "America/Los_Angeles", ...searchConsoleDates(options.period)};
  const request = async (url: string, body?: unknown) => {
    const response = await (options.fetchImpl ?? fetch)(url, { method: body ? "POST" : "GET", headers: {authorization: `Bearer ${options.accessToken}`, "content-type": "application/json"}, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "access_denied" : "unavailable");
    return response.json();
  };
  try {
    const host = new URL(options.origin).hostname;
    let property = options.property;
    if (!property) {
      const sites = await request("https://www.googleapis.com/webmasters/v3/sites") as {siteEntry?: {siteUrl: string}[]};
      const matches = (sites.siteEntry ?? []).filter((site) => { try { return site.siteUrl === `sc-domain:${host}` || new URL(site.siteUrl).hostname === host; } catch { return false; } });
      property = matches.find((site) => site.siteUrl === `sc-domain:${host}`)?.siteUrl ?? matches.find((site) => site.siteUrl === new URL("/", options.origin).href)?.siteUrl;
    }
    if (!property) return {...base, status: "property_unavailable"};
    // Only website properties belonging to this installation may be selected.
    if (property !== `sc-domain:${host}` && new URL(property).hostname !== host) return {...base, status: "property_unavailable"};
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
    const common = {startDate: base.startDate, endDate: base.endDate, type: "web", dataState: "all"};
    const [summary, detail] = await Promise.all([request(url, {...common, dimensions: [], rowLimit: 1}), request(url, {...common, dimensions: ["query", "page"], rowLimit: 50})]) as [{rows?: {clicks: number; impressions: number; ctr: number; position: number}[]}, {rows?: {keys: string[]; clicks: number; impressions: number; ctr: number; position: number}[]}];
    return {...base, status: "ready", property, summary: summary.rows?.[0], rows: (detail.rows ?? []).flatMap((row) => {
      try { const page = new URL(row.keys[1]); if (page.hostname !== host) return []; return [{query: row.keys[0], pagePath: page.pathname, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position}]; } catch { return []; }
    })};
  } catch (error) { return {...base, status: error instanceof Error && error.message === "access_denied" ? "access_denied" : "unavailable"}; }
}
