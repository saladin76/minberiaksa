import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { isKnownLocale } from "@/lib/locales";

export type JsonMap = Record<string, unknown>;
export type CampaignLinkStatus = "ACTIVE" | "ARCHIVED" | "DELETED";
export type CampaignLinkStatusFilter = CampaignLinkStatus | "ALL";

export type CampaignLinkPayload = {
  name?: string;
  platform?: string;
  channel?: string;
  url?: string;
  basePath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmId?: string;
  utmContent?: string;
  campaignId?: string;
  adGroupId?: string;
  adsetId?: string;
  adId?: string;
  audienceSegment?: string;
  messageVariant?: string;
  targetCountry?: string;
  locale?: string;
  objective?: string;
  internalNotes?: string;
  raw?: JsonMap;
};

export type CampaignLinkInput = {
  name: string;
  platform: string;
  channel?: string | null;
  url: string;
  basePath?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmId?: string | null;
  utmContent?: string | null;
  campaignId?: string | null;
  adGroupId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  targetCountry?: string | null;
  objective?: string | null;
  audienceSegment?: string | null;
  messageVariant?: string | null;
  locale?: string | null;
  internalNotes?: string | null;
  createdBy?: string | null;
  raw?: JsonMap | null;
};

export type CampaignLinkRecord = CampaignLinkInput & {
  id: string;
  status: CampaignLinkStatus;
  saveCount: number;
  createdAt: string;
  updatedAt: string;
};

type MongoDoc = Record<string, unknown>;

export function isMap(value: unknown): value is MongoDoc {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value.trim().slice(0, 1000) || null : null;
}

export function campaignLinkUrlHash(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

export function campaignLinkObjectIdFilter(id: string) {
  return /^[a-f\d]{24}$/i.test(id) ? { _id: { $oid: id } } : null;
}

export function activeCampaignLinkFilter(): JsonMap {
  return { $or: [{ status: "ACTIVE" }, { status: { $exists: false } }, { status: null }] };
}

export function campaignLinkStatusFilter(status: CampaignLinkStatusFilter): JsonMap {
  if (status === "ALL") return {};
  if (status === "ACTIVE") return activeCampaignLinkFilter();
  return { status };
}

export function parseCampaignLinkStatusFilter(value: unknown): CampaignLinkStatusFilter {
  const status = readString(value)?.toUpperCase();
  if (status === "ARCHIVED" || status === "DELETED" || status === "ALL") return status;
  return "ACTIVE";
}

export function readCampaignLinkPayload(body: JsonMap): CampaignLinkPayload {
  return {
    name: readString(body.name) ?? undefined,
    platform: readString(body.platform)?.toUpperCase() ?? undefined,
    channel: readString(body.channel)?.toUpperCase() ?? undefined,
    url: readString(body.url) ?? undefined,
    basePath: readString(body.basePath) ?? undefined,
    utmSource: readString(body.utmSource) ?? readString(body.utm_source) ?? undefined,
    utmMedium: readString(body.utmMedium) ?? readString(body.utm_medium) ?? undefined,
    utmCampaign: readString(body.utmCampaign) ?? readString(body.utm_campaign) ?? undefined,
    utmId: readString(body.utmId) ?? readString(body.utm_id) ?? undefined,
    utmContent: readString(body.utmContent) ?? readString(body.utm_content) ?? undefined,
    campaignId: readString(body.campaignId) ?? readString(body.campaign_id) ?? undefined,
    adGroupId: readString(body.adGroupId) ?? readString(body.ad_group_id) ?? undefined,
    adsetId: readString(body.adsetId) ?? readString(body.adset_id) ?? undefined,
    adId: readString(body.adId) ?? readString(body.ad_id) ?? undefined,
    audienceSegment: readString(body.audienceSegment) ?? readString(body.audience_segment) ?? undefined,
    messageVariant: readString(body.messageVariant) ?? readString(body.message_variant) ?? undefined,
    targetCountry: readString(body.targetCountry)?.toUpperCase() ?? readString(body.target_country)?.toUpperCase() ?? undefined,
    locale: normalizeLinkLocale(readString(body.locale) ?? readString(body.lang)) ?? undefined,
    objective: readString(body.objective) ?? undefined,
    internalNotes: readOptionalString(body.internalNotes) ?? readOptionalString(body.internal_notes) ?? undefined,
    raw: isMap(body.raw) ? body.raw : undefined,
  };
}

function idString(value: unknown) {
  if (typeof value === "string") return value;
  if (isMap(value) && typeof value.$oid === "string") return value.$oid;
  return "";
}

function toDateIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
  if (isMap(value) && typeof value.$date === "string") {
    const date = new Date(value.$date);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
  return new Date().toISOString();
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Keep a link's target locale only when it's a known catalog locale (lowercased). */
function normalizeLinkLocale(value: string | null): string | null {
  const code = value?.trim().toLowerCase();
  return code && isKnownLocale(code) ? code : null;
}

function normalizePlatform(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function normalizeStatus(value: unknown): CampaignLinkStatus {
  const status = typeof value === "string" ? value.toUpperCase() : "ACTIVE";
  if (status === "ARCHIVED" || status === "DELETED") return status;
  return "ACTIVE";
}

function cleanInput(input: CampaignLinkInput) {
  return {
    name: input.name.trim(),
    platform: normalizePlatform(input.platform),
    channel: stringOrNull(input.channel),
    url: input.url.trim(),
    urlHash: campaignLinkUrlHash(input.url.trim()),
    basePath: stringOrNull(input.basePath),
    utmSource: stringOrNull(input.utmSource),
    utmMedium: stringOrNull(input.utmMedium),
    utmCampaign: stringOrNull(input.utmCampaign),
    utmId: stringOrNull(input.utmId),
    utmContent: stringOrNull(input.utmContent),
    campaignId: stringOrNull(input.campaignId),
    adGroupId: stringOrNull(input.adGroupId),
    adsetId: stringOrNull(input.adsetId),
    adId: stringOrNull(input.adId),
    targetCountry: stringOrNull(input.targetCountry)?.toUpperCase() ?? null,
    locale: normalizeLinkLocale(stringOrNull(input.locale)),
    objective: stringOrNull(input.objective),
    audienceSegment: stringOrNull(input.audienceSegment),
    messageVariant: stringOrNull(input.messageVariant),
    internalNotes: stringOrNull(input.internalNotes),
    createdBy: stringOrNull(input.createdBy),
    raw: isMap(input.raw) ? input.raw : null,
  };
}

function mapCampaignLink(doc: MongoDoc): CampaignLinkRecord {
  return {
    id: idString(doc._id),
    name: stringOrNull(doc.name) ?? stringOrNull(doc.utmCampaign) ?? "Marketing link",
    platform: stringOrNull(doc.platform) ?? "UNKNOWN",
    channel: stringOrNull(doc.channel),
    url: stringOrNull(doc.url) ?? "",
    basePath: stringOrNull(doc.basePath),
    utmSource: stringOrNull(doc.utmSource),
    utmMedium: stringOrNull(doc.utmMedium),
    utmCampaign: stringOrNull(doc.utmCampaign),
    utmId: stringOrNull(doc.utmId),
    utmContent: stringOrNull(doc.utmContent),
    campaignId: stringOrNull(doc.campaignId),
    adGroupId: stringOrNull(doc.adGroupId),
    adsetId: stringOrNull(doc.adsetId),
    adId: stringOrNull(doc.adId),
    targetCountry: stringOrNull(doc.targetCountry),
    locale: stringOrNull(doc.locale),
    objective: stringOrNull(doc.objective),
    audienceSegment: stringOrNull(doc.audienceSegment),
    messageVariant: stringOrNull(doc.messageVariant),
    internalNotes: stringOrNull(doc.internalNotes),
    createdBy: stringOrNull(doc.createdBy),
    raw: isMap(doc.raw) ? doc.raw : null,
    status: normalizeStatus(doc.status),
    saveCount: typeof doc.saveCount === "number" ? doc.saveCount : 0,
    createdAt: toDateIso(doc.createdAt),
    updatedAt: toDateIso(doc.updatedAt),
  };
}

export async function ensureCampaignLinkIndexes() {
  await prisma.$runCommandRaw({ createIndexes: "MarketingCampaignLink", indexes: [
    { key: { createdAt: -1 }, name: "createdAt_desc" },
    { key: { platform: 1, createdAt: -1 }, name: "platform_createdAt" },
    { key: { platform: 1, status: 1, updatedAt: -1 }, name: "platform_status_updatedAt" },
    { key: { status: 1, updatedAt: -1 }, name: "status_updatedAt" },
    { key: { campaignId: 1 }, name: "campaignId" },
    { key: { adId: 1 }, name: "adId" },
    { key: { utmCampaign: 1 }, name: "utmCampaign" },
    { key: { urlHash: 1 }, name: "urlHash_unique", unique: true },
  ] }).catch(() => null);
}

export async function createOrUpdateCampaignLink(input: CampaignLinkInput): Promise<CampaignLinkRecord> {
  await ensureCampaignLinkIndexes();
  const now = new Date();
  const payload = cleanInput(input);

  const result = await prisma.$runCommandRaw({
    findAndModify: "MarketingCampaignLink",
    query: { $or: [{ urlHash: payload.urlHash }, { url: payload.url }] },
    update: {
      $set: { ...payload, status: "ACTIVE", updatedAt: now },
      $setOnInsert: { createdAt: now, saveCount: 0 },
      $inc: { saveCount: 1 },
    },
    upsert: true,
    new: true,
  }) as MongoDoc;

  const value = isMap(result.value) ? result.value : {};
  return mapCampaignLink(value);
}

export async function listCampaignLinks(args: { limit?: number; platform?: string | null; status?: CampaignLinkStatusFilter } = {}): Promise<CampaignLinkRecord[]> {
  await ensureCampaignLinkIndexes();
  const filter: JsonMap = campaignLinkStatusFilter(args.status ?? "ACTIVE");
  if (args.platform) filter.platform = normalizePlatform(args.platform);

  const result = await prisma.$runCommandRaw({
    find: "MarketingCampaignLink",
    filter,
    sort: { updatedAt: -1, createdAt: -1 },
    limit: args.limit ?? 100,
  }) as MongoDoc;

  const rows = isMap(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch : [];
  return rows.filter(isMap).map(mapCampaignLink);
}
