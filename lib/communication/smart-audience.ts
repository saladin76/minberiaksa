import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { donorChannelEligibility } from "./audience-service";

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
  eligibleLanguages: Record<string, number>;
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
      hasContact: f.hasContact === true,
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


export async function getSmartAudienceDefinitionForSegmentKey(key: string | null | undefined): Promise<SmartAudienceDefinition | null> {
  if (!key || !key.startsWith("list:")) return null;
  return getSmartAudienceDefinitionForList(key.slice("list:".length));
}

export async function getSmartAudienceDefinitionForList(listId: string): Promise<SmartAudienceDefinition | null> {
  const row = await prisma.communicationAudienceList
    .findUnique({ where: { id: listId }, select: { type: true, metadata: true, channels: true } })
    .catch(() => null);
  if (!row || row.type !== "SMART") return null;
  return smartAudienceFromMetadata(row.metadata);
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

function eligibleWhere(definition: SmartAudienceDefinition): Prisma.UserWhereInput {
  const base = buildSmartAudienceUserWhere(definition);
  if (definition.channel === "EMAIL") {
    return {
      ...base,
      email: { not: null },
      communicationProfile: { is: { emailOptIn: true, doNotContact: false } },
    };
  }
  if (definition.channel === "SMS") {
    return {
      ...base,
      phone: { not: null },
      communicationProfile: { is: { smsOptIn: true, doNotContact: false } },
    };
  }
  return {
    ...base,
    phone: { not: null },
    OR: [
      { communicationProfile: { is: null } },
      { communicationProfile: { is: { doNotContact: false } } },
    ],
  };
}

export async function previewSmartAudience(
  definition: SmartAudienceDefinition,
  sampleLimit = 50,
): Promise<SmartAudiencePreview> {
  const where = buildSmartAudienceUserWhere(definition);
  const eligibleFilter = eligibleWhere(definition);
  const missingFilter: Prisma.UserWhereInput =
    definition.channel === "EMAIL" ? { ...where, email: null } : { ...where, phone: null };
  const dncFilter: Prisma.UserWhereInput = {
    ...where,
    communicationProfile: { is: { doNotContact: true } },
  };

  const [matched, eligible, missingContact, doNotContact, languageRows, eligibleLanguageRows, sampleRows] = await Promise.all([
    prisma.user.count({ where }).catch(() => 0),
    prisma.user.count({ where: eligibleFilter }).catch(() => 0),
    prisma.user.count({ where: missingFilter }).catch(() => 0),
    prisma.user.count({ where: dncFilter }).catch(() => 0),
    prisma.user.groupBy({ by: ["preferredLang"], where, _count: { id: true } }).catch(() => []),
    prisma.user.groupBy({ by: ["preferredLang"], where: eligibleFilter, _count: { id: true } }).catch(() => []),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        preferredLang: true,
        countryCode: true,
        communicationProfile: { select: { doNotContact: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true } },
      },
      orderBy: { id: "asc" },
      take: Math.max(1, Math.min(sampleLimit, 50)),
    }).catch(() => []),
  ]);

  const languages: Record<string, number> = {};
  for (const row of languageRows) {
    const locale = row.preferredLang && isValidLocale(row.preferredLang) ? row.preferredLang : DEFAULT_LOCALE;
    languages[locale] = (languages[locale] ?? 0) + row._count.id;
  }

  const eligibleLanguages: Record<string, number> = {};
  for (const row of eligibleLanguageRows) {
    const locale = row.preferredLang && isValidLocale(row.preferredLang) ? row.preferredLang : DEFAULT_LOCALE;
    eligibleLanguages[locale] = (eligibleLanguages[locale] ?? 0) + row._count.id;
  }

  const sample = sampleRows.map((u) => {
    const locale = (u.preferredLang && isValidLocale(u.preferredLang) ? u.preferredLang : DEFAULT_LOCALE) as SupportedLocale;
    const state = donorChannelEligibility(
      { email: u.email, phone: u.phone },
      definition.channel,
      u.communicationProfile,
    );
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      locale,
      countryCode: u.countryCode,
      eligible: state === "ELIGIBLE",
    };
  });

  return {
    matched,
    eligible,
    missingContact,
    doNotContact,
    unavailable: Math.max(0, matched - eligible),
    languages,
    eligibleLanguages,
    sample,
  };
}
