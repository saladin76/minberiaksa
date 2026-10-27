import type { SyncClient } from "./types";
import { missingConfigResult } from "./types";
import { googleSearchClient, credentialsReady, searchCredentials, SearchApiError } from "../google-search/client";
import { googleAdsAdPerformanceQuery } from "./google-ads-queries";
import { mapGoogleAdsRows } from "./google-ads-mapper";
/** Authenticated, paginated GAQL reads; no ad operations. */
export const syncGoogleAds: SyncClient = async ({ connection, dateFrom, dateTo }) => {
  const credentials = searchCredentials(connection);
  if (!credentialsReady(credentials)) return missingConfigResult(["accountId", "developerToken", "appId", "clientSecret", "refreshToken"].filter(key => !connection[key as keyof typeof connection]), "أكمل بيانات حساب Google Ads ورمز المطوّر وتفويض OAuth.");
  try {
    const client = await googleSearchClient(credentials);
    const rows = await client.query(googleAdsAdPerformanceQuery(dateFrom, dateTo), 50000);
    return { status: "SUCCESS", rowsFetched: rows.length, message: "تمت مزامنة تقارير Google Ads للمدة المحددة.", snapshots: mapGoogleAdsRows(rows, connection.defaultCurrency) };
  } catch (error) { return { status: "FAILED", rowsFetched: 0, message: "تعذر جلب تقارير Google Ads.", error: error instanceof SearchApiError ? error.code : "GOOGLE_ADS_SYNC_FAILED" }; }
};
