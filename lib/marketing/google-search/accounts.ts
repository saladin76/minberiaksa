import { createHash } from "node:crypto";
import type { MarketingPlatformConnection } from "@prisma/client";
import { credentialsReady, searchCredentials } from "./client";
export const accountRevision = (row: MarketingPlatformConnection) => createHash("sha256").update(JSON.stringify([row.id, row.updatedAt, row.accountId, row.managerAccountId, row.appId, row.clientSecret, row.refreshToken, row.developerToken, row.enabled, row.name, row.configChecklist])).digest("hex");
export function publicSearchAccount(row: MarketingPlatformConnection) {
  const metadata = row.configChecklist as { googleAdsFundingType?: string; googleAdsTrackingEnabled?: boolean } | null;
  return { conversionId: row.conversionId, conversionLabel: row.conversionLabel, trackingEnabled: metadata?.googleAdsTrackingEnabled === true, id: row.id, name: row.name, customerId: row.accountId, managerId: row.managerAccountId, clientId: row.appId, enabled: row.enabled, ready: credentialsReady(searchCredentials(row)), fundingType: metadata?.googleAdsFundingType === "AD_GRANTS" ? "AD_GRANTS" : metadata?.googleAdsFundingType === "PAID" ? "PAID" : "UNSPECIFIED", revision: accountRevision(row), status: row.status, lastTestAt: row.lastTestAt?.toISOString() ?? null, secrets: { clientSecret: Boolean(row.clientSecret), refreshToken: Boolean(row.refreshToken), developerToken: Boolean(row.developerToken) } };
}
