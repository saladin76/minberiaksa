/**
 * GA4 sync stub. Real implementation would fetch traffic + conversions
 * via the Data API. Reads only — no events sent here.
 */
import type { SyncClient } from "./types";
import { missingConfigResult, notImplementedResult } from "./types";

export const syncGa4: SyncClient = async ({ connection }) => {
  const missing: string[] = [];
  if (!connection.accountId) missing.push("accountId"); // Measurement ID
  if (!connection.apiSecret) missing.push("apiSecret");
  if (missing.length > 0) {
    return missingConfigResult(
      missing,
      "ناقص بيانات GA4 — Measurement ID و API Secret."
    );
  }
  return notImplementedResult(
    "مزامنة GA4 Data API ستُفعّل في المرحلة التالية."
  );
};
