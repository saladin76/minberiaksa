import { parseGa4Period, type Ga4Period } from "./ga4-period";

export type GoogleAdsCredentials = { customerId: string; developerToken: string; clientId: string; clientSecret: string; refreshToken: string; managerId?: string; version?: string };
export type GoogleAdsPerformanceRow = { label: string; campaign: string; matchType: string; impressions: number; clicks: number; cost: number; conversions: number; conversionValue: number };
export type GoogleAdsReport = { customerId: string; currency: string; timezone: string; period: { startDate: string; endDate: string }; updatedAt: string; campaigns: GoogleAdsPerformanceRow[]; keywords: GoogleAdsPerformanceRow[]; searchTerms: GoogleAdsPerformanceRow[]; bounded: boolean };
export class GoogleAdsReportError extends Error { constructor(readonly code: string, readonly status = 502) { super(code); } }
type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const customer = (value: string) => value.replaceAll("-", "").trim();

/** Only OAuth token refresh and fixed GAQL SELECT queries. No mutation API is exposed. */
export async function fetchGoogleAdsReport(credentials: GoogleAdsCredentials, selection: Ga4Period, fetcher: typeof fetch = fetch, now = new Date()): Promise<GoogleAdsReport> {
  const period = parseGa4Period(selection, now);
  const id = customer(credentials.customerId), manager = customer(credentials.managerId || "");
  const version = credentials.version || "v26";
  if (!/^\d{10}$/.test(id) || (manager && !/^\d{10}$/.test(manager)) || !/^v\d+$/.test(version)) throw new GoogleAdsReportError("GOOGLE_ADS_CONFIG_INVALID", 409);
  if (![credentials.developerToken, credentials.clientId, credentials.clientSecret, credentials.refreshToken].every(value => value.trim())) throw new GoogleAdsReportError("GOOGLE_ADS_CONFIG_MISSING", 409);
  const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000), body: new URLSearchParams({ grant_type: "refresh_token", client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken }) });
  const token = object(await tokenResponse.json());
  if (!tokenResponse.ok || !string(token.access_token)) throw new GoogleAdsReportError("GOOGLE_ADS_AUTH_FAILED", 403);
  const query = async (gaql: string): Promise<Row[]> => {
    const response = await fetcher(`https://googleads.googleapis.com/${version}/customers/${id}/googleAds:search`, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.access_token}`, "developer-token": credentials.developerToken, ...(manager ? { "login-customer-id": manager } : {}) }, body: JSON.stringify({ query: gaql }) });
    if (!response.ok) throw new GoogleAdsReportError(response.status === 401 || response.status === 403 ? "GOOGLE_ADS_ACCESS_DENIED" : response.status === 429 ? "GOOGLE_ADS_QUOTA" : "GOOGLE_ADS_REPORT_FAILED", response.status === 401 || response.status === 403 ? 403 : response.status === 429 ? 429 : 502);
    const result = object(await response.json());
    if (!Array.isArray(result.results) && result.results !== undefined) throw new GoogleAdsReportError("GOOGLE_ADS_REPORT_FAILED");
    if (result.nextPageToken) throw new GoogleAdsReportError("GOOGLE_ADS_REPORT_LIMIT");
    return (result.results as unknown[] || []).map(object);
  };
  const account = object((await query("SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1"))[0]?.customer);
  const currency = string(account.currencyCode), timezone = string(account.timeZone);
  if (!currency || !timezone) throw new GoogleAdsReportError("GOOGLE_ADS_ACCOUNT_UNAVAILABLE");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  const midnight = Date.parse(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
  const day = (offset: number) => new Date(midnight + offset * 86_400_000).toISOString().slice(0, 10);
  const endDate = period.range === "custom" ? period.endDate! : day(period.range === "today" ? 0 : -1);
  const startDate = period.range === "custom" ? period.startDate! : period.range === "today" ? day(0) : period.range === "yesterday" ? day(-1) : day(-Number(period.range.slice(0, -1)));
  const metricFields = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value";
  const range = `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
  const [campaigns, keywords, searchTerms] = await Promise.all([
    query(`SELECT campaign.name, ${metricFields} FROM campaign WHERE ${range} ORDER BY metrics.cost_micros DESC LIMIT 50`),
    query(`SELECT campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ${metricFields} FROM keyword_view WHERE ${range} AND campaign.advertising_channel_type = 'SEARCH' ORDER BY metrics.cost_micros DESC LIMIT 100`),
    query(`SELECT campaign.name, search_term_view.search_term, ${metricFields} FROM search_term_view WHERE ${range} AND campaign.advertising_channel_type = 'SEARCH' ORDER BY metrics.cost_micros DESC LIMIT 100`),
  ]);
  const normalize = (row: Row, kind: "campaign" | "keyword" | "term"): GoogleAdsPerformanceRow => {
    const metrics = object(row.metrics), campaign = string(object(row.campaign).name), keyword = object(object(row.adGroupCriterion).keyword);
    return { label: kind === "keyword" ? string(keyword.text) : kind === "term" ? string(object(row.searchTermView).searchTerm) : campaign, campaign, matchType: string(keyword.matchType), impressions: number(metrics.impressions), clicks: number(metrics.clicks), cost: number(metrics.costMicros) / 1_000_000, conversions: number(metrics.conversions), conversionValue: number(metrics.conversionsValue) };
  };
  return { customerId: id, currency, timezone, period: { startDate, endDate }, updatedAt: now.toISOString(), campaigns: campaigns.map(row => normalize(row, "campaign")), keywords: keywords.map(row => normalize(row, "keyword")), searchTerms: searchTerms.map(row => normalize(row, "term")), bounded: campaigns.length === 50 || keywords.length === 100 || searchTerms.length === 100 };
}
