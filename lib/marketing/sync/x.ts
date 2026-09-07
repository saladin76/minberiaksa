/**
 * X (Twitter) Ads API sync client. Stub — needs Ads API access from the
 * X developer portal before live calls. Preflights credentials then
 * returns NOT_IMPLEMENTED with guidance.
 */
import type { SyncClient } from "./types";
import { missingConfigResult, notImplementedResult } from "./types";

export const syncX: SyncClient = async ({ connection }) => {
  const missing: string[] = [];
  if (!connection.accountId) missing.push("accountId");
  if (!connection.accessToken) missing.push("accessToken");
  if (missing.length > 0) {
    return missingConfigResult(
      missing,
      "ناقص بيانات X — Ad Account ID و Access Token. قد تحتاج إلى تفعيل Ads API من X Developer Portal."
    );
  }
  return notImplementedResult(
    "مزامنة X Ads API ستُفعّل بعد تفعيل صلاحية Ads API من X Developer Portal."
  );
};
