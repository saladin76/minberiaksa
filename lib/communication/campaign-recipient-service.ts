import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { donorChannelEligibility } from "./audience-service";
import { parseListKey, loadListMembers, loadListMembersPage, memberEligibleForChannel, type ResolvedListMember } from "./audience-list-service";
import { safeCountValue } from "@/lib/dashboard/safe-count";
import { countSmartAudience, getSmartAudienceDefinitionForList, loadSmartAudiencePage, previewSmartAudience } from "./smart-audience";
import { ensureProfilesForUsers } from "./donor-communication-profile-service";

/**
 * Recipient counts + eligibility breakdown for a campaign, per locale, for one channel.
 * DonorCommunicationProfile is the sole consent source. Legacy User flags bootstrap only missing
 * profiles and never override existing recorded consent.
 */

export type LocaleRecipientBreakdown = {
  locale: SupportedLocale;
  label: string;
  total: number;
  eligible: number;
  needsReview: number;
  missingContact: number;
  optedOut: number;
  doNotContact: number;
};

export type CampaignRecipientBreakdown = {
  channel: CommunicationChannelId;
  locales: LocaleRecipientBreakdown[];
  totals: Omit<LocaleRecipientBreakdown, "locale" | "label">;
  recipientLocaleCounts: Record<string, number>; // eligible-per-locale, for language coverage
};

const DONOR = { role: "DONOR" as const };

async function localeBreakdown(channel: CommunicationChannelId, locale: SupportedLocale): Promise<LocaleRecipientBreakdown> {
  const base = { ...DONOR, preferredLang: locale };
  const [total, withEmail, withPhone, dnc] = await Promise.all([
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { ...base, email: { not: null } } }),
    prisma.user.count({ where: { ...base, phone: { not: null } } }),
    safeCountValue("recipients.doNotContact", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, doNotContact: true } })),
  ]);

  if (channel === "EMAIL") {
    const [eligible, optedOut, profiled] = await Promise.all([
      safeCountValue("recipients.emailEligible", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, email: { not: null }, emailOptIn: true, doNotContact: false } })),
      safeCountValue("recipients.emailOptedOut", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, email: { not: null }, emailOptIn: false, doNotContact: false } })),
      safeCountValue("recipients.emailProfiled", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, email: { not: null } } })),
    ]);
    const needsReview = Math.max(0, withEmail - profiled);
    return { locale, label: LOCALES[locale].label, total, eligible, needsReview, missingContact: Math.max(0, total - withEmail), optedOut, doNotContact: dnc };
  }
  if (channel === "SMS") {
    const [eligible, optedOut, profiled] = await Promise.all([
      safeCountValue("recipients.smsEligible", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, phone: { not: null }, smsOptIn: true, doNotContact: false } })),
      safeCountValue("recipients.smsOptedOut", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, phone: { not: null }, smsOptIn: false, doNotContact: false } })),
      safeCountValue("recipients.smsProfiled", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, phone: { not: null } } })),
    ]);
    const needsReview = Math.max(0, withPhone - profiled);
    return { locale, label: LOCALES[locale].label, total, eligible, needsReview, missingContact: Math.max(0, total - withPhone), optedOut, doNotContact: dnc };
  }
  // WHATSAPP donors with a phone are eligible unless explicitly marked do-not-contact.
  const eligible = Math.max(0, withPhone - dnc);
  const needsReview = 0;
  return { locale, label: LOCALES[locale].label, total, eligible, needsReview, missingContact: Math.max(0, total - withPhone), optedOut: 0, doNotContact: dnc };
}

/** Load a custom/test list's members with per-member channel eligibility (donors use consent). */
async function resolveListMembersWithEligibility(channel: CommunicationChannelId, listId: string): Promise<{ m: ResolvedListMember; eligible: boolean }[]> {
  const members = await loadListMembers(listId);
  const donorIds = members.filter((m) => m.contactType === "DONOR" && m.userId).map((m) => m.userId!) as string[];
  if (donorIds.length) await ensureProfilesForUsers(donorIds);
  const profiles = donorIds.length
    ? await prisma.donorCommunicationProfile.findMany({ where: { userId: { in: donorIds } }, select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true } }).catch(() => [])
    : [];
  const pMap = new Map(profiles.map((p) => [p.userId, p]));
  return members.map((m) => ({ m, eligible: memberEligibleForChannel(m, channel, m.userId ? pMap.get(m.userId) ?? null : null) }));
}

export async function getRecipientBreakdown(
  channel: CommunicationChannelId,
  opts: { locale?: string | null } = {}
): Promise<CampaignRecipientBreakdown> {
  // Custom / test list audience  compute the breakdown from the list's members.
  const listId = parseListKey(opts.locale);
  if (listId) {
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) {
      const preview = await previewSmartAudience(smart, 1);
      const locales: LocaleRecipientBreakdown[] = Object.entries(preview.languages)
        .filter(([locale]) => isValidLocale(locale))
        .map(([locale, total]) => ({
          locale: locale as SupportedLocale,
          label: LOCALES[locale as SupportedLocale].label,
          total,
          eligible: preview.eligibleLanguages[locale] ?? 0,
          needsReview: 0,
          missingContact: 0,
          optedOut: 0,
          doNotContact: 0,
        }));
      const totals = {
        total: preview.matched,
        eligible: preview.eligible,
        needsReview: 0,
        missingContact: preview.missingContact,
        optedOut: Math.max(0, preview.unavailable - preview.missingContact - preview.doNotContact),
        doNotContact: preview.doNotContact,
      };
      const recipientLocaleCounts: Record<string, number> = {};
      for (const l of locales) recipientLocaleCounts[l.locale] = l.eligible;
      return { channel, locales, totals, recipientLocaleCounts };
    }
    const resolved = await resolveListMembersWithEligibility(channel, listId);
    const byLocale = new Map<SupportedLocale, { total: number; eligible: number }>();
    for (const { m, eligible } of resolved) {
      const cur = byLocale.get(m.locale) ?? { total: 0, eligible: 0 };
      cur.total += 1;
      if (eligible) cur.eligible += 1;
      byLocale.set(m.locale, cur);
    }
    const locales: LocaleRecipientBreakdown[] = SUPPORTED_LOCALES.filter((l) => byLocale.has(l)).map((l) => {
      const c = byLocale.get(l)!;
      return { locale: l, label: LOCALES[l].label, total: c.total, eligible: c.eligible, needsReview: 0, missingContact: c.total - c.eligible, optedOut: 0, doNotContact: 0 };
    });
    const totals = locales.reduce(
      (acc, l) => ({ total: acc.total + l.total, eligible: acc.eligible + l.eligible, needsReview: 0, missingContact: acc.missingContact + l.missingContact, optedOut: 0, doNotContact: 0 }),
      { total: 0, eligible: 0, needsReview: 0, missingContact: 0, optedOut: 0, doNotContact: 0 }
    );
    const recipientLocaleCounts: Record<string, number> = {};
    for (const l of locales) recipientLocaleCounts[l.locale] = l.eligible;
    return { channel, locales, totals, recipientLocaleCounts };
  }

  const targetLocales: SupportedLocale[] =
    opts.locale && isValidLocale(opts.locale) ? [opts.locale] : [...SUPPORTED_LOCALES];

  const locales = await Promise.all(targetLocales.map((l) => localeBreakdown(channel, l)));

  const totals = locales.reduce(
    (acc, l) => ({
      total: acc.total + l.total,
      eligible: acc.eligible + l.eligible,
      needsReview: acc.needsReview + l.needsReview,
      missingContact: acc.missingContact + l.missingContact,
      optedOut: acc.optedOut + l.optedOut,
      doNotContact: acc.doNotContact + l.doNotContact,
    }),
    { total: 0, eligible: 0, needsReview: 0, missingContact: 0, optedOut: 0, doNotContact: 0 }
  );

  const recipientLocaleCounts: Record<string, number> = {};
  for (const l of locales) recipientLocaleCounts[l.locale] = l.eligible;

  return { channel, locales, totals, recipientLocaleCounts };
}

export type CampaignRecipient = {
  /** Cursor position in the underlying audience source (user id for smart/global, member id for saved lists). */
  cursorId: string;
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: SupportedLocale;
  country: string | null;
};

export type RecipientLoadResult = {
  recipients: CampaignRecipient[];
  skipped: { cursorId: string; userId: string; locale: string; reason: string }[];
  /** True when this page did not reach the end of the audience  another page follows. */
  truncated: boolean;
  /** Pass back as `cursor` to continue after this page. Null when there is nothing to continue from. */
  nextCursor: string | null;
  /** True when the audience has been walked to its end and no further page exists. */
  exhausted: boolean;
};

/**
 * How many contacts the audience holds in total, regardless of batching.
 *
 * The plan describes one batch, so its `total` is at most `batchSize`  showing that as "this many
 * will receive it" told an operator 200 when the audience was 3,000. This is the number the send
 * confirmation needs. It counts membership, not eligibility: consent is re-checked per batch at send
 * time and cannot be known here without reading every row.
 */
export async function countCampaignAudience(audienceSegmentKey: string | null): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  const listId = parseListKey(audienceSegmentKey);
  if (listId) {
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) return countSmartAudience(smart);
    return prisma.communicationAudienceMember
      .count({ where: { listId, status: "ACTIVE", contactType: "DONOR" } })
      .catch(() => 0);
  }
  const targetLocales: SupportedLocale[] = audienceSegmentKey && isValidLocale(audienceSegmentKey) ? [audienceSegmentKey] : [...SUPPORTED_LOCALES];
  return prisma.user.count({ where: { role: "DONOR", preferredLang: { in: targetLocales } } }).catch(() => 0);
}

/**
 * Load one page of eligible recipients for a campaign send. Applies channel eligibility per donor
 * (prefers DonorCommunicationProfile, falls back to User notification flags). Ineligible donors are
 * returned in `skipped` with a reason  the executor archives those as SKIPPED.
 *
 * Paging is by cursor, not offset, and it is the send pipeline's guarantee of completeness: the
 * executor walks page after page until `exhausted`, so an audience larger than one batch finishes
 * instead of stopping after the first slice. An offset would also have drifted  donors are created
 * and their consent changes while a large send is in flight  whereas the cursor (an ascending id)
 * describes a position that stays valid between runs.
 *
 * The cursor is the last row *scanned*, not the last row sent: a page whose rows were all ineligible
 * still advances, or the send would loop on the same ineligible slice forever.
 */
export async function loadCampaignRecipients(
  channel: CommunicationChannelId,
  audienceSegmentKey: string | null,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<RecipientLoadResult> {
  const limit = Math.min(opts.limit ?? 500, 1000);
  const cursor = opts.cursor ?? null;

  // Custom / test list audience  send to the list's DONOR members (test contacts are NOT sent via the
  // campaign executor; they are reserved for the dedicated test-send tooling).
  const listId = parseListKey(audienceSegmentKey);
  if (listId) {
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) {
      const { members, nextCursor, exhausted } = await loadSmartAudiencePage(smart, { limit, cursorId: cursor });
      const userIds = members.map((m) => m.id);
      const profiles = userIds.length
        ? await prisma.donorCommunicationProfile.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true },
          }).catch(() => [])
        : [];
      const pMap = new Map(profiles.map((p) => [p.userId, p]));
      const recipients: CampaignRecipient[] = [];
      const skipped: { cursorId: string; userId: string; locale: string; reason: string }[] = [];
      for (const m of members) {
        const eligibility = donorChannelEligibility(
          { email: m.email, phone: m.phone },
          channel,
          pMap.get(m.id) ?? null,
        );
        if (eligibility === "ELIGIBLE") {
          recipients.push({ cursorId: m.id, userId: m.id, name: m.name, email: m.email, phone: m.phone, locale: m.locale, country: m.countryCode });
        } else {
          skipped.push({ cursorId: m.id, userId: m.id, locale: m.locale, reason: eligibility === "NEEDS_REVIEW" ? "NEEDS_CONSENT_REVIEW" : "NOT_ELIGIBLE" });
        }
      }
      return { recipients, skipped, truncated: !exhausted, nextCursor, exhausted };
    }
    const { members, nextCursor, exhausted } = await loadListMembersPage(listId, { limit, cursorId: cursor });
    const donorIds = members.filter((m) => m.contactType === "DONOR" && m.userId).map((m) => m.userId!) as string[];
    if (donorIds.length) await ensureProfilesForUsers(donorIds);
    const profiles = donorIds.length
      ? await prisma.donorCommunicationProfile.findMany({ where: { userId: { in: donorIds } }, select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true } }).catch(() => [])
      : [];
    const pMap = new Map(profiles.map((p) => [p.userId, p]));
    const recipients: CampaignRecipient[] = [];
    const skipped: { cursorId: string; userId: string; locale: string; reason: string }[] = [];
    for (const m of members) {
      if (m.contactType !== "DONOR" || !m.userId) continue;
      if (memberEligibleForChannel(m, channel, pMap.get(m.userId) ?? null)) {
        recipients.push({ cursorId: m.memberId, userId: m.userId, name: m.name, email: m.email, phone: m.phone, locale: m.locale, country: m.country });
      } else {
        skipped.push({ cursorId: m.memberId, userId: m.userId, locale: m.locale, reason: "NOT_ELIGIBLE" });
      }
    }
    return { recipients, skipped, truncated: !exhausted, nextCursor, exhausted };
  }

  const targetLocales: SupportedLocale[] = audienceSegmentKey && isValidLocale(audienceSegmentKey) ? [audienceSegmentKey] : [...SUPPORTED_LOCALES];

  const users = await prisma.user.findMany({
    where: { role: "DONOR", preferredLang: { in: targetLocales }, ...(cursor ? { id: { gt: cursor } } : {}) },
    select: { id: true, name: true, email: true, phone: true, preferredLang: true, countryCode: true, emailNotifications: true, smsNotifications: true },
    orderBy: { id: "asc" },
    take: limit,
  });
  const exhausted = users.length < limit;
  const page = users;
  const nextCursor = page.length ? page[page.length - 1].id : cursor;

  await ensureProfilesForUsers(page.map((u) => u.id));
  const profiles = await prisma.donorCommunicationProfile
    .findMany({ where: { userId: { in: page.map((u) => u.id) } }, select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true } })
    .catch(() => []);
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const recipients: CampaignRecipient[] = [];
  const skipped: { cursorId: string; userId: string; locale: string; reason: string }[] = [];

  for (const u of page) {
    const locale = (u.preferredLang && isValidLocale(u.preferredLang) ? u.preferredLang : DEFAULT_LOCALE) as SupportedLocale;
    const profile = profileMap.get(u.id) ?? null;
    const eligibility = donorChannelEligibility(
      { email: u.email, phone: u.phone, emailNotifications: u.emailNotifications, smsNotifications: u.smsNotifications },
      channel,
      profile
    );
    if (eligibility === "ELIGIBLE") {
      recipients.push({ cursorId: u.id, userId: u.id, name: u.name, email: u.email, phone: u.phone, locale, country: u.countryCode });
    } else {
      skipped.push({ cursorId: u.id, userId: u.id, locale, reason: eligibility === "NEEDS_REVIEW" ? "NEEDS_CONSENT_REVIEW" : "NOT_ELIGIBLE" });
    }
  }

  return { recipients, skipped, truncated: !exhausted, nextCursor, exhausted };
}
