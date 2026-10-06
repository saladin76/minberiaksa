import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { donorChannelEligibility } from "./audience-service";
import { ensureProfilesForUsers } from "./donor-communication-profile-service";

export const SMART_AUDIENCE_METADATA_KEY = "smartAudience";

export type SmartAudienceFilters = {
  countries?: string[];
  locales?: string[];
  donatedWithinDays?: number | null;
  projectIds?: string[];
  recurringOnly?: boolean;
  minDonationAmountUSD?: number | null;
  hasContact?: boolean;
};

export type SmartAudienceDefinition = {
  version: 1;
  kind: "SMART";
  channel: CommunicationChannelId;
  filters: SmartAudienceFilters;
  excludeUserIds?: string[];
  fallbackLocale?: string | null;
};

export type SmartAudiencePreview = {
  matched: number;
  eligible: number;
  missingContact: number;
  doNotContact: number;
  unavailable: number;
  languages: Record<string, number>;
  sample: Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    locale: SupportedLocale;
    countryCode: string | null;
    eligible: boolean;
  }>;
};

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))];
}

export function normalizeSmartAudienceDefinition(input: unknown, channel: CommunicationChannelId): SmartAudienceDefinition {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const f = (raw.filters && typeof raw.filters === "object" ? raw.filters : {}) as Record<string, unknown>;
  const donatedWithinDays = typeof f.donatedWithinDays === "number" && Number.isFinite(f.donatedWithinDays)
    ? Math.max(1, Math.min(3650, Math.floor(f.donatedWithinDays)))
    : null;
  const minDonationAmountUSD = typeof f.minDonationAmountUSD === "number" && Number.isFinite(f.minDonationAmountUSD)
    ? Math.max(0, f.minDonationAmountUSD)
    : null;
  const fallback = typeof raw.fallbackLocale === "string" && isValidLocale(raw.fallbackLocale)
    ? raw.fallbackLocale
    : DEFAULT_LOCALE;

  return {
    version: 1,
    kind: "SMART",
    channel,
    filters: {
      countries: cleanList(f.countries).map((v) => v.toUpperCase()).slice(0, 100),
      locales: cleanList(f.locales).filter(isValidLocale),
      donatedWithinDays,
      projectIds: cleanList(f.projectIds).slice(0, 100),
      recurringOnly: f.recurringOnly === true,
      minDonationAmountUSD,
      hasContact: f.hasContact !== false,
    },
    excludeUserIds: cleanList(raw.excludeUserIds).slice(0, 500),
    fallbackLocale: fallback,
  };
}

export function smartAudienceFromMetadata(metadata: unknown): SmartAudienceDefinition | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[SMART_AUDIENCE_METADATA_KEY];
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SmartAudienceDefinition>;
  if (candidate.kind !== "SMART" || candidate.version !== 1) return null;
  if (!["WHATSAPP", "EMAIL", "SMS"].includes(String(candidate.channel))) return null;
  return normalizeSmartAudienceDefinition(candidate, candidate.channel as CommunicationChannelId);
}

export function smartAudienceMetadata(definition: SmartAudienceDefinition, extra: Record<string, unknown> = {}) {
  return { ...extra, [SMART_AUDIENCE_METADATA_KEY]: definition };
}

export function buildSmartAudienceUserWhere(definition: SmartAudienceDefinition): Prisma.UserWhereInput {
  const f = definition.filters;
  const where: Prisma.UserWhereInput = { role: "DONOR" };

  if (f.countries?.length) where.countryCode = { in: f.countries };
  if (f.locales?.length) where.preferredLang = { in: f.locales };
  if (definition.excludeUserIds?.length) where.id = { notIn: definition.excludeUserIds };

  const donationClauses: Prisma.DonationWhereInput[] = [];
  if (f.donatedWithinDays) {
    const since = new Date(Date.now() - f.donatedWithinDays * 24 * 60 * 60 * 1000);
    donationClauses.push({ status: "PAID", paidAt: { gte: since } });
  }
  if (f.projectIds?.length) {
    donationClauses.push({ status: "PAID", items: { some: { campaignId: { in: f.projectIds } } } });
  }
  if (f.minDonationAmountUSD && f.minDonationAmountUSD > 0) {
    donationClauses.push({
      status: "PAID",
      OR: [
        { amountUSD: { gte: f.minDonationAmountUSD } },
        { AND: [{ amountUSD: null }, { currency: "USD" }, { amount: { gte: f.minDonationAmountUSD } }] },
      ],
    });
  }
  if (donationClauses.length) {
    where.donations = { some: donationClauses.length === 1 ? donationClauses[0] : { AND: donationClauses } };
  }

  if (f.recurringOnly) where.subscriptions = { some: { status: "ACTIVE" } };

  if (f.hasContact !== false) {
    if (definition.channel === "EMAIL") where.email = { not: null };
    else where.phone = { not: null };
  }

  return where;
}

type SmartUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredLang: string | null;
  countryCode: string | null;
};

export async function loadSmartAudiencePage(
  definition: SmartAudienceDefinition,
  opts: { limit: number; cursorId?: string | null },
): Promise<{ members: Array<SmartUserRow & { locale: SupportedLocale }>; nextCursor: string | null; exhausted: boolean }> {
  const limit = Math.max(1, Math.min(opts.limit, 1000));
  const where = buildSmartAudienceUserWhere(definition);
  if (opts.cursorId) {
    const currentId = where.id && typeof where.id === "object" && !Array.isArray(where.id) ? where.id : {};
    where.id = { ...(currentId as Prisma.StringFilter), gt: opts.cursorId };
  }
  const rows = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, phone: true, preferredLang: true, countryCode: true },
    orderBy: { id: "asc" },
    take: limit,
  });
  const nextCursor = rows.length ? rows[rows.length - 1].id : opts.cursorId ?? null;
  return {
    members: rows.map((u) => ({
      ...u,
      locale: (u.preferredLang && isValidLocale(u.preferredLang) ? u.preferredLang : DEFAULT_LOCALE) as SupportedLocale,
    })),
    nextCursor,
    exhausted: rows.length < limit,
  };
}

export async function countSmartAudience(definition: SmartAudienceDefinition): Promise<number> {
  return prisma.user.count({ where: buildSmartAudienceUserWhere(definition) }).catch(() => 0);
}

export async function previewSmartAudience(
  definition: SmartAudienceDefinition,
  sampleLimit = 50,
): Promise<SmartAudiencePreview> {
  const where = buildSmartAudienceUserWhere(definition);
  const matched = await prisma.user.count({ where }).catch(() => 0);

  const languages: Record<string, number> = {};
  const sample: SmartAudiencePreview["sample"] = [];
  let eligible = 0;
  let missingContact = 0;
  let doNotContact = 0;
  let unavailable = 0;
  let cursor: string | null = null;

  while (true) {
    const rows = await prisma.user.findMany({
      where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, name: true, email: true, phone: true, preferredLang: true, countryCode: true, emailNotifications: true, smsNotifications: true },
      orderBy: { id: "asc" },
      take: 1000,
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    await ensureProfilesForUsers(rows.map((r) => r.id));
    const profiles = await prisma.donorCommunicationProfile.findMany({
      where: { userId: { in: rows.map((r) => r.id) } },
      select: { userId: true, doNotContact: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true },
    }).catch(() => []);
    const pMap = new Map(profiles.map((p) => [p.userId, p]));

    for (const u of rows) {
      const locale = (u.preferredLang && isValidLocale(u.preferredLang) ? u.preferredLang : DEFAULT_LOCALE) as SupportedLocale;
      languages[locale] = (languages[locale] ?? 0) + 1;
      const profile = pMap.get(u.id) ?? null;
      const missing = definition.channel === "EMAIL" ? !u.email : !u.phone;
      if (missing) missingContact += 1;
      if (profile?.doNotContact) doNotContact += 1;
      const state = donorChannelEligibility(
        { email: u.email, phone: u.phone, emailNotifications: u.emailNotifications, smsNotifications: u.smsNotifications },
        definition.channel,
        profile,
      );
      if (state === "ELIGIBLE") eligible += 1;
      else unavailable += 1;

      if (sample.length < sampleLimit) {
        sample.push({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          locale,
          countryCode: u.countryCode,
          eligible: state === "ELIGIBLE",
        });
      }
    }
    if (rows.length < 1000) break;
  }

  return { matched, eligible, missingContact, doNotContact, unavailable, languages, sample };
}
