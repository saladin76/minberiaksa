import { prisma } from "@/lib/prisma";

export const TRACKING_SETTINGS_COLLECTION = "TrackingSettings";

export type RawTrackingSettings = Record<string, unknown>;

export type PublicTrackingConfig = {
  facebookPixelId: string | null;
  gaMeasurementId: string | null;
  googleAdsConversionId: string | null;
  googleAdsConversionLabel: string | null;
  tiktokPixelId: string | null;
  xPixelId: string | null;
};

export type MetaCapiCredentials = {
  pixelId: string;
  accessToken: string;
};

export type Ga4ServerCredentials = {
  measurementId: string | null;
  apiSecret: string | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function trackingString(row: RawTrackingSettings | null, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function trackingBoolean(row: RawTrackingSettings | null, key: string): boolean {
  const value = row?.[key];
  return value === true;
}

export async function getRawTrackingSettings(): Promise<RawTrackingSettings | null> {
  const result = await prisma.$runCommandRaw({
    find: TRACKING_SETTINGS_COLLECTION,
    limit: 1,
    sort: { createdAt: 1 },
  });
  const batch = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch)
    ? result.cursor.firstBatch
    : [];
  return (batch[0] as RawTrackingSettings | undefined) ?? null;
}

export async function getPublicTrackingConfig(): Promise<PublicTrackingConfig> {
  const row = await getRawTrackingSettings();
  return {
    facebookPixelId: trackingString(row, "facebookPixelId"),
    gaMeasurementId: trackingString(row, "gaMeasurementId"),
    googleAdsConversionId: trackingString(row, "googleAdsConversionId"),
    googleAdsConversionLabel: trackingString(row, "googleAdsConversionLabel"),
    tiktokPixelId: trackingString(row, "tiktokPixelId"),
    xPixelId: trackingString(row, "xPixelId"),
  };
}

export async function getMetaCapiCredentialsFromSettings(): Promise<MetaCapiCredentials | null> {
  const row = await getRawTrackingSettings().catch((error) => {
    console.error("[tracking-settings] failed to read Meta settings", error);
    return null;
  });
  const pixelId =
    trackingString(row, "facebookPixelId") ||
    trackingString(row, "metaPixelId") ||
    process.env.META_PIXEL_ID ||
    null;
  const accessToken =
    trackingString(row, "facebookAccessToken") ||
    trackingString(row, "metaAccessToken") ||
    process.env.META_ACCESS_TOKEN ||
    null;
  if (!pixelId || !accessToken) return null;
  return { pixelId, accessToken };
}

export async function getGa4ServerCredentialsFromSettings(): Promise<Ga4ServerCredentials> {
  const row = await getRawTrackingSettings().catch((error) => {
    console.error("[tracking-settings] failed to read GA4 settings", error);
    return null;
  });
  return {
    measurementId: trackingString(row, "gaMeasurementId") || process.env.GA4_MEASUREMENT_ID || null,
    apiSecret: trackingString(row, "gaApiSecret") || process.env.GA4_API_SECRET || null,
  };
}
