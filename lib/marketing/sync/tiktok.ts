/**
 * TikTok Marketing API sync client. Stub — credential preflight then
 * NOT_IMPLEMENTED until the live REST client is added.
 */
import type { SyncClient } from "./types";
import { missingConfigResult, notImplementedResult } from "./types";

export const syncTikTok: SyncClient = async ({ connection }) => {
  const missing: string[] = [];
  if (!connection.advertiserId) missing.push("advertiserId");
  if (!connection.accessToken) missing.push("accessToken");
  if (!connection.pixelId) missing.push("pixelId");
  if (missing.length > 0) {
    return missingConfigResult(
      missing,
      "ناقص بيانات TikTok — Advertiser ID و Access Token و Pixel Code."
    );
  }
  return notImplementedResult(
    "مزامنة TikTok Reports API ستُفعّل في المرحلة التالية."
  );
};
