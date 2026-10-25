import "server-only";
import { fetchSearchConsole } from "./search-console";
import { createHash } from "node:crypto";
import { JWT } from "google-auth-library";
import { decryptIntegrationSecret } from "@/lib/integration-settings/crypto";
import { getRawTrackingSettings, trackingString } from "@/lib/tracking/tracking-settings";
import { Ga4ApiError, fetchGa4DashboardReport, parseGa4ServiceAccountJson } from "./ga4-reporting";
import { ga4PeriodKey, type Ga4Period } from "./ga4-period";

export class Ga4ReportError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const cache = new Map<string, { expiresAt: number; data: Ga4ReportResult }>();
export type Ga4ReportResult = { propertyId: string; range: Ga4Period["range"]; period: Ga4Period; updatedAt: string; cached: boolean; report: Awaited<ReturnType<typeof fetchGa4DashboardReport>> };

/** Reuse the encrypted tracking connection for reports, analysis and SEO. */
export async function loadGa4DashboardReport(period: Ga4Period, forceRefresh = false): Promise<Ga4ReportResult> {
  try {
    const settings = await getRawTrackingSettings();
    const propertyId = trackingString(settings, "gaPropertyId") || process.env.GA4_PROPERTY_ID?.trim();
    if (!propertyId) throw new Ga4ReportError("GA4_PROPERTY_MISSING", 409);
    if (!/^\d{4,20}$/.test(propertyId)) throw new Ga4ReportError("GA4_PROPERTY_INVALID", 409);
    let json = process.env.GA4_SERVICE_ACCOUNT_JSON?.trim() ?? "";
    const encrypted = trackingString(settings, "gaServiceAccountEncrypted");
    if (encrypted) {
      try { json = decryptIntegrationSecret(encrypted, "tracking-settings:ga4-service-account"); }
      catch { throw new Ga4ReportError("GA4_CREDENTIALS_UNREADABLE", 503); }
    }
    if (!json) throw new Ga4ReportError("GA4_CREDENTIALS_MISSING", 409);
    const account = parseGa4ServiceAccountJson(json);
    if (!account) throw new Ga4ReportError("GA4_CREDENTIALS_INVALID", 409);
    const key = `${propertyId}:${ga4PeriodKey(period)}:${createHash("sha256").update(json).digest("hex")}`;
    const stored = cache.get(key);
    if (!forceRefresh && stored && stored.expiresAt > Date.now()) return { ...stored.data, cached: true };
    let token;
    try {
      const auth = new JWT({ email: account.client_email, key: account.private_key, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
      ({ token } = await auth.getAccessToken());
    } catch { throw new Ga4ReportError("GA4_AUTHENTICATION_FAILED", 502); }
    if (!token) throw new Ga4ReportError("GA4_AUTHENTICATION_FAILED", 502);
    const report = await fetchGa4DashboardReport({ propertyId, accessToken: token, range: period, includeExtended: true });
    try {
      const searchAuth = new JWT({email: account.client_email, key: account.private_key, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"]});
      const searchToken = (await searchAuth.getAccessToken()).token;
      report.organicSearch = searchToken ? await fetchSearchConsole({accessToken: searchToken, origin: process.env.NEXT_PUBLIC_SITE_URL || "https://minberiaksa.org", property: process.env.SEARCH_CONSOLE_SITE_URL, period}) : {status: "unavailable", rows: [], timezone: "America/Los_Angeles"};
    } catch { report.organicSearch = {status: "unavailable", rows: [], timezone: "America/Los_Angeles"}; }
    const data = { propertyId, range: period.range, period, updatedAt: new Date().toISOString(), report, cached: false };
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(key, { expiresAt: Date.now() + 5 * 60_000, data });
    return data;
  } catch (error) {
    if (error instanceof Ga4ReportError) throw error;
    if (error instanceof Ga4ApiError) throw new Ga4ReportError(error.status === 401 || error.status === 403 ? "GA4_ACCESS_DENIED" : error.status === 429 ? "GA4_QUOTA_EXCEEDED" : "GA4_REPORT_FAILED", error.status === 401 || error.status === 403 ? 403 : error.status === 429 ? 429 : 502);
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new Ga4ReportError("GA4_REPORT_TIMEOUT", 504);
    throw new Ga4ReportError("GA4_REPORT_FAILED", 502);
  }
}
