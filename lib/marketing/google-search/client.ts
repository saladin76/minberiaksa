import type { MarketingPlatformConnection } from "@prisma/client";
import type { GoogleAdsCredentials } from "../google-ads-report";

export class SearchApiError extends Error {
  constructor(readonly code: string, readonly status = 502, readonly uncertain = false) { super(code); }
}
export function searchCredentials(row: MarketingPlatformConnection): GoogleAdsCredentials {
  return { customerId: row.accountId || "", developerToken: row.developerToken || "", clientId: row.appId || "", clientSecret: row.clientSecret || "", refreshToken: row.refreshToken || "", managerId: row.managerAccountId || "", version: process.env.GOOGLE_ADS_API_VERSION || "v26" };
}
export const credentialsReady = (c: GoogleAdsCredentials) => /^\d{10}$/.test(c.customerId.replaceAll("-", "")) && [c.developerToken, c.clientId, c.clientSecret, c.refreshToken].every(Boolean);
/** Fields selected by the fixed queries in this module's callers. */
export type SearchRow = {
  customer: { currencyCode: string; timeZone: string };
  campaign: { resourceName: string; name: string; status: string; campaignBudget: string };
  campaignBudget: { amountMicros: string; explicitlyShared: boolean; recommendedBudgetAmountMicros?: string };
  searchTermView?: { searchTerm?: string };
  adGroupCriterion: { resourceName: string; keyword: { text: string }; status: string };
  metrics: Record<string, string | number>;
  languageConstant: { code: string; resourceName: string };
  geoTargetConstant: { countryCode: string; resourceName: string };
  text: string;
  keywordIdeaMetrics?: Record<string, unknown>;
};
type SearchResponse = { results?: SearchRow[]; nextPageToken?: string; mutateOperationResponses?: { campaignResult?: { resourceName?: string } }[] };
type GoogleErrorDetail = { errors?: { errorCode?: Record<string, unknown> }[] };

/** Fixed vendor hosts; caller never supplies an endpoint or arbitrary request headers. */
export async function googleSearchClient(c: GoogleAdsCredentials, fetcher: typeof fetch = fetch) {
  const id = c.customerId.replaceAll("-", ""), manager = (c.managerId || "").replaceAll("-", "");
  const version = c.version || "v26";
  if (!credentialsReady(c) || (manager && !/^\d{10}$/.test(manager)) || !/^v\d+$/.test(version)) throw new SearchApiError("GOOGLE_ADS_CONFIG_MISSING", 409);
  const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000), body: new URLSearchParams({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken }) });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new SearchApiError("GOOGLE_ADS_AUTH_FAILED", 403);
  const call = async (method: "googleAds:search" | "googleAds:mutate" | "generateKeywordIdeas", body: unknown): Promise<SearchResponse> => {
    const mutation = method === "googleAds:mutate" && !(body as { validateOnly?: boolean }).validateOnly;
    let response: Response;
    try {
      response = await fetcher(`https://googleads.googleapis.com/${version}/customers/${id}/${method}`, { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.access_token}`, "developer-token": c.developerToken, ...(manager ? { "login-customer-id": manager } : {}) }, body: JSON.stringify(body) });
    } catch { throw new SearchApiError("GOOGLE_ADS_OUTCOME_UNKNOWN", 502, mutation); }
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      // Keep provider codes, never raw request bodies/tokens in dashboard errors.
      const codes = (value?.error?.details || []).flatMap((d: GoogleErrorDetail) => (d.errors || []).map((e: { errorCode?: Record<string, unknown> }) => Object.values(e.errorCode || {}).join(":"))).slice(0, 8).join(",");
      throw new SearchApiError(`GOOGLE_ADS_${response.status}${codes ? ":" + codes : ""}`, response.status === 429 ? 429 : response.status === 403 ? 403 : 502, mutation && response.status >= 500);
    }
    if (!value || typeof value !== "object") throw new SearchApiError("GOOGLE_ADS_RESPONSE_INVALID", 502, mutation);
    return value;
  };
  const query = async (gaql: string, maxRows = 10000): Promise<SearchRow[]> => {
    const rows: SearchRow[] = []; let pageToken: string | undefined;
    const tokens = new Set<string>();
    do {
      const page = await call("googleAds:search", { query: gaql, ...(pageToken ? { pageToken } : {}) });
      if (page.results !== undefined && !Array.isArray(page.results)) throw new SearchApiError("GOOGLE_ADS_RESPONSE_INVALID");
      rows.push(...(page.results || []));
      pageToken = page.nextPageToken;
      if (pageToken) {
        if (typeof pageToken !== "string" || tokens.has(pageToken)) throw new SearchApiError("GOOGLE_ADS_PAGINATION_INVALID", 502);
        tokens.add(pageToken);
      }
      if (rows.length > maxRows || (pageToken && rows.length >= maxRows)) throw new SearchApiError("GOOGLE_ADS_REPORT_LIMIT", 409);
    } while (pageToken);
    return rows;
  };
  return { id, query, call };
}
export type GoogleSearchClient = Awaited<ReturnType<typeof googleSearchClient>>;
