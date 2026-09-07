/**
 * Google Ads (GAQL) sync client. Stub for this phase — credential preflight
 * + NOT_IMPLEMENTED. When implemented it should run GAQL queries against
 * campaign / ad_group / ad_group_ad with segments.date and standard cost /
 * impressions / clicks / conversions metrics.
 */
import type { SyncClient } from "./types";
import { missingConfigResult, notImplementedResult } from "./types";

export const syncGoogleAds: SyncClient = async ({ connection }) => {
  const missing: string[] = [];
  if (!connection.accountId) missing.push("accountId");
  if (!connection.developerToken) missing.push("developerToken");
  if (!connection.appId) missing.push("appId"); // OAuth client id
  if (!connection.clientSecret) missing.push("clientSecret");
  if (!connection.refreshToken) missing.push("refreshToken");
  if (missing.length > 0) {
    return missingConfigResult(
      missing,
      "ناقص بيانات Google Ads — Customer ID و Developer Token و OAuth client id/secret و Refresh Token."
    );
  }
  return notImplementedResult(
    "مزامنة Google Ads عبر GAQL ستُفعّل في المرحلة التالية — كل البيانات المطلوبة متوفرة."
  );
};
