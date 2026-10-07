import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { getUserIdsMatchingBadge } from "@/lib/badge-criteria";
import { summarizeCampaignAudience, type AudienceAccountingRow } from "./audience-preview-accounting";
import type { RecipientExclusionReason } from "./campaign-audience-accounting";

export const SMART_AUDIENCE_METADATA_KEY = "smartAudience";

export type SmartAudienceFilters = {
  countries?: string[];
  locales?: string[];
  donatedWithinDays?: number | null;
  notDonatedWithinDays?: number | null;
  projectIds?: string[];
  badgeIds?: string[];
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
  needsReview: number;
  unavailable: number;
  languages: Record<string, number>;
  eligibleLanguages: Record<string, number>;
  reasons: Partial<Record<RecipientExclusionReason, number>>;
  sample: Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    locale: SupportedLocale;
    countryCode: string | null;
    eligible: boolean;
    exclusionReason: RecipientExclusionReason | null;
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
  const notDonatedWithinDays = typeof f.notDonatedWithinDays === "number" && Number.isFinite(f.notDonatedWithinDays)
    ? Math.max(1, Math.min(3650, Math.floor(f.notDonatedWithinDays)))
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
      notDonatedWithinDays,
      projectIds: cleanList(f.projectIds).slice(0, 100),
      badgeIds: cleanList(f.badgeIds).slice(0, 20),
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
    .findUnique({ where: { id: listId }, select: { type: true, metadata: true, channels: true } });
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

  if (f.notDonatedWithinDays) {
    const since = new Date(Date.now() - f.notDonatedWithinDays * 24 * 60 * 60 * 1000);
    const currentAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    where.AND = [
      ...currentAnd,
      { donations: { none: { status: "PAID", paidAt: { gte: since } } } },
    ];
  }

  if (f.recurringOnly) where.subscriptions = { some: { status: "ACTIVE" } };

  // Contact presence is an explicit audience choice, never an implicit default.
  if (f.hasContact === true) {
    const currentAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    const contactFilter: Prisma.UserWhereInput[] = definition.channel === "EMAIL"
      ? [{ email: { not: null } }, { email: { not: "" } }]
      : [{ phone: { not: null } }, { phone: { not: "" } }];
    where.AND = [...currentAnd, ...contactFilter];
  }

  return where;
}

async function resolveSmartAudienceUserWhere(definition: SmartAudienceDefinition): Promise<Prisma.UserWhereInput> {
  const where = buildSmartAudienceUserWhere(definition);
  const badgeIds = definition.filters.badgeIds ?? [];
  if (!badgeIds.length) return where;

  const badges = await prisma.badge.findMany({
    where: { id: { in: badgeIds } },
    select: { id: true, criteria: true },
  });

  const matched = new Set<string>();
  for (const badge of badges) {
    const ids = await getUserIdsMatchingBadge(badge.criteria);
    for (const id of ids) matched.add(id);
  }

  const existingId = where.id && typeof where.id === "object" && !Array.isArray(where.id)
    ? where.id as Prisma.StringFilter
    : {};
  where.id = { ...existingId, in: [...matched] };
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
  const where = await resolveSmartAudienceUserWhere(definition);
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
  return prisma.user.count({ where: await resolveSmartAudienceUserWhere(definition) });
}

/**
 * Read each selected donor once, in bounded server-side pages. The previous
 * independent counts disagreed on MongoDB missing fields and silently returned
 * zero on read failures. Membership is unchanged by consent/contact checks;
 * those checks explain eligibility instead of deleting people from the audience.
 */
export async function previewSmartAudience(
  definition: SmartAudienceDefinition,
  sampleLimit = 50,
  signal?: AbortSignal,
): Promise<SmartAudiencePreview> {
  signal?.throwIfAborted();
  const where = await resolveSmartAudienceUserWhere(definition);
  const last = await prisma.user.findFirst({
    where, orderBy: { id: "desc" }, select: { id: true },
  });

  async function* rows(): AsyncGenerator<AudienceAccountingRow> {
    if (!last) return;
    let cursor: string | null = null;
    while (true) {
      signal?.throwIfAborted();
      const page = await prisma.user.findMany({
        where: { AND: [where, { id: { lte: last.id, ...(cursor ? { gt: cursor } : {}) } }] },
        select: {
          id: true, name: true, email: true, phone: true,
          preferredLang: true, countryCode: true,
          communicationProfile: { select: { doNotContact: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true } },
        },
        orderBy: { id: "asc" },
        take: 1000,
      });
      if (!page.length) return;
      for (const user of page) {
        yield {
          id: user.id, name: user.name, email: user.email, phone: user.phone,
          countryCode: user.countryCode, communicationProfile: user.communicationProfile,
          locale: user.preferredLang && isValidLocale(user.preferredLang) ? user.preferredLang : DEFAULT_LOCALE,
        };
      }
      cursor = page[page.length - 1].id;
      if (page.length < 1000) return;
    }
  }

  const result = await summarizeCampaignAudience(rows(), definition.channel, sampleLimit, signal);
  return {
    ...result,
    sample: result.sample.map((item) => ({ ...item, locale: item.locale as SupportedLocale })),
  };
}
