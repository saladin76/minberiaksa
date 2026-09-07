/**
 * Shared serialization for `MarketingPlatformConnection` rows. Masks secrets,
 * attaches the readiness checklist, and returns a JSON-safe shape for the
 * dashboard. Used by every endpoint so the response contract stays
 * consistent.
 */
import {
  evaluateReadiness,
  isPlatformKey,
  type ConnectionStatus,
  type PlatformKey,
  type ReadinessResult,
} from "./platform-connection-requirements";
import { maskSecretFields } from "./secrets";

type ConnectionRow = {
  id: string;
  category: string;
  platform: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  businessId: string | null;
  managerAccountId: string | null;
  pixelId: string | null;
  datasetId: string | null;
  conversionId: string | null;
  conversionLabel: string | null;
  advertiserId: string | null;
  appId: string | null;
  propertyId: string | null;
  streamId: string | null;
  messagingServiceSid: string | null;
  senderId: string | null;
  whatsappSender: string | null;
  smsSender: string | null;
  emailSender: string | null;
  status: string;
  enabled: boolean;
  defaultForPlatform: boolean;
  supportedLocales: string[];
  supportedCountries: string[];
  defaultCurrency: string | null;
  notes: string | null;
  configChecklist: unknown;
  accessToken: string | null;
  refreshToken: string | null;
  authToken: string | null;
  appSecret: string | null;
  clientSecret: string | null;
  developerToken: string | null;
  apiSecret: string | null;
  lastSyncAt: Date | null;
  lastTestAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
};

export interface SerializedConnection {
  id: string;
  category: string;
  platform: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  businessId: string | null;
  managerAccountId: string | null;
  pixelId: string | null;
  datasetId: string | null;
  conversionId: string | null;
  conversionLabel: string | null;
  advertiserId: string | null;
  appId: string | null;
  propertyId: string | null;
  streamId: string | null;
  messagingServiceSid: string | null;
  senderId: string | null;
  whatsappSender: string | null;
  smsSender: string | null;
  emailSender: string | null;
  status: ConnectionStatus;
  enabled: boolean;
  defaultForPlatform: boolean;
  supportedLocales: string[];
  supportedCountries: string[];
  defaultCurrency: string | null;
  notes: string | null;
  configChecklist: unknown;
  accessTokenMasked: string | null;
  accessTokenPresent: boolean;
  refreshTokenMasked: string | null;
  refreshTokenPresent: boolean;
  authTokenMasked: string | null;
  authTokenPresent: boolean;
  appSecretMasked: string | null;
  appSecretPresent: boolean;
  clientSecretMasked: string | null;
  clientSecretPresent: boolean;
  developerTokenMasked: string | null;
  developerTokenPresent: boolean;
  apiSecretMasked: string | null;
  apiSecretPresent: boolean;
  lastSyncAt: string | null;
  lastTestAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  readiness: ReadinessResult;
}

export function serializeConnection(row: ConnectionRow): SerializedConnection {
  const platformKey: PlatformKey = isPlatformKey(row.platform)
    ? row.platform
    : "CUSTOM";
  const readiness = evaluateReadiness(platformKey, row as unknown as Record<string, unknown>, {
    enabled: row.enabled,
    existingStatus:
      (row.status as ConnectionStatus | undefined) ?? undefined,
  });
  const masked = maskSecretFields(row as unknown as Record<string, unknown>);
  return {
    id: row.id,
    category: row.category,
    platform: row.platform,
    name: row.name,
    accountId: row.accountId,
    accountName: row.accountName,
    businessId: row.businessId,
    managerAccountId: row.managerAccountId,
    pixelId: row.pixelId,
    datasetId: row.datasetId,
    conversionId: row.conversionId,
    conversionLabel: row.conversionLabel,
    advertiserId: row.advertiserId,
    appId: row.appId,
    propertyId: row.propertyId,
    streamId: row.streamId,
    messagingServiceSid: row.messagingServiceSid,
    senderId: row.senderId,
    whatsappSender: row.whatsappSender,
    smsSender: row.smsSender,
    emailSender: row.emailSender,
    status: readiness.status,
    enabled: row.enabled,
    defaultForPlatform: row.defaultForPlatform,
    supportedLocales: row.supportedLocales ?? [],
    supportedCountries: row.supportedCountries ?? [],
    defaultCurrency: row.defaultCurrency,
    notes: row.notes,
    configChecklist: row.configChecklist,
    accessTokenMasked: masked.accessTokenMasked,
    accessTokenPresent: masked.accessTokenPresent,
    refreshTokenMasked: masked.refreshTokenMasked,
    refreshTokenPresent: masked.refreshTokenPresent,
    authTokenMasked: masked.authTokenMasked,
    authTokenPresent: masked.authTokenPresent,
    appSecretMasked: masked.appSecretMasked,
    appSecretPresent: masked.appSecretPresent,
    clientSecretMasked: masked.clientSecretMasked,
    clientSecretPresent: masked.clientSecretPresent,
    developerTokenMasked: masked.developerTokenMasked,
    developerTokenPresent: masked.developerTokenPresent,
    apiSecretMasked: masked.apiSecretMasked,
    apiSecretPresent: masked.apiSecretPresent,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastTestAt: row.lastTestAt ? row.lastTestAt.toISOString() : null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    readiness,
  };
}
