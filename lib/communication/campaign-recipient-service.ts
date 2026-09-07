import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { donorChannelEligibility } from "./audience-service";
import { parseListKey, loadListMembers, memberEligibleForChannel, type ResolvedListMember } from "./audience-list-service";
import { safeCountValue } from "@/lib/dashboard/safe-count";

/**
 * Recipient counts + eligibility breakdown for a campaign, per locale, for one channel.
 * Read-only. Prefers the DonorCommunicationProfile for WhatsApp opt-in and do-not-contact,
 * and falls back to the legacy User notification flags for email/SMS.
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
    const [eligible, optedOut] = await Promise.all([
      prisma.user.count({ where: { ...base, email: { not: null }, emailNotifications: true } }),
      prisma.user.count({ where: { ...base, email: { not: null }, emailNotifications: false } }),
    ]);
    return { locale, label: LOCALES[locale].label, total, eligible: Math.max(0, eligible - dnc), needsReview: 0, missingContact: Math.max(0, total - withEmail), optedOut, doNotContact: dnc };
  }
  if (channel === "SMS") {
    const [eligible, optedOut] = await Promise.all([
      prisma.user.count({ where: { ...base, phone: { not: null }, smsNotifications: true } }),
      prisma.user.count({ where: { ...base, phone: { not: null }, smsNotifications: false } }),
    ]);
    return { locale, label: LOCALES[locale].label, total, eligible: Math.max(0, eligible - dnc), needsReview: 0, missingContact: Math.max(0, total - withPhone), optedOut, doNotContact: dnc };
  }
  // WHATSAPP — eligible only with explicit opt-in; other phone contacts need review.
  const eligible = await safeCountValue("recipients.whatsappEligible", () =>
    prisma.donorCommunicationProfile.count({
      where: { preferredLocale: locale, whatsappOptIn: true, doNotContact: false },
    })
  );
  const needsReview = Math.max(0, withPhone - eligible);
  return { locale, label: LOCALES[locale].label, total, eligible, needsReview, missingContact: Math.max(0, total - withPhone), optedOut: 0, doNotContact: dnc };
}

/** Load a custom/test list's members with per-member channel eligibility (donors use consent). */
async function resolveListMembersWithEligibility(channel: CommunicationChannelId, listId: string): Promise<{ m: ResolvedListMember; eligible: boolean }[]> {
  const members = await loadListMembers(listId);
  const donorIds = members.filter((m) => m.contactType === "DONOR" && m.userId).map((m) => m.userId!) as string[];
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
  // Custom / test list audience — compute the breakdown from the list's members.
  const listId = parseListKey(opts.locale);
  if (listId) {
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
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: SupportedLocale;
  country: string | null;
};

export type RecipientLoadResult = {
  recipients: CampaignRecipient[];
  skipped: { userId: string; locale: string; reason: string }[];
  truncated: boolean;
};

/**
 * Load the individual eligible recipients for a campaign send (bounded batch). Applies channel
 * eligibility per donor (prefers DonorCommunicationProfile, falls back to User notification flags).
 * Ineligible donors are returned in `skipped` with a reason — the executor archives those as SKIPPED.
 */
export async function loadCampaignRecipients(
  channel: CommunicationChannelId,
  audienceSegmentKey: string | null,
  opts: { limit?: number } = {}
): Promise<RecipientLoadResult> {
  const limit = Math.min(opts.limit ?? 500, 1000);

  // Custom / test list audience — send to the list's DONOR members (test contacts are NOT sent via the
  // campaign executor; they are reserved for the dedicated test-send tooling).
  const listId = parseListKey(audienceSegmentKey);
  if (listId) {
    const resolved = await resolveListMembersWithEligibility(channel, listId);
    const recipients: CampaignRecipient[] = [];
    const skipped: { userId: string; locale: string; reason: string }[] = [];
    for (const { m, eligible } of resolved) {
      if (m.contactType !== "DONOR" || !m.userId) continue;
      if (recipients.length >= limit) break;
      if (eligible) recipients.push({ userId: m.userId, name: m.name, email: m.email, phone: m.phone, locale: m.locale, country: m.country });
      else skipped.push({ userId: m.userId, locale: m.locale, reason: "NOT_ELIGIBLE" });
    }
    return { recipients, skipped, truncated: false };
  }

  const targetLocales: SupportedLocale[] = audienceSegmentKey && isValidLocale(audienceSegmentKey) ? [audienceSegmentKey] : [...SUPPORTED_LOCALES];

  const users = await prisma.user.findMany({
    where: { role: "DONOR", preferredLang: { in: targetLocales } },
    select: { id: true, name: true, email: true, phone: true, preferredLang: true, countryCode: true, emailNotifications: true, smsNotifications: true },
    take: limit + 1,
  });
  const truncated = users.length > limit;
  const page = users.slice(0, limit);

  const profiles = await prisma.donorCommunicationProfile
    .findMany({ where: { userId: { in: page.map((u) => u.id) } }, select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true } })
    .catch(() => []);
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const recipients: CampaignRecipient[] = [];
  const skipped: { userId: string; locale: string; reason: string }[] = [];

  for (const u of page) {
    const locale = (u.preferredLang && isValidLocale(u.preferredLang) ? u.preferredLang : DEFAULT_LOCALE) as SupportedLocale;
    const profile = profileMap.get(u.id) ?? null;
    const eligibility = donorChannelEligibility(
      { email: u.email, phone: u.phone, emailNotifications: u.emailNotifications, smsNotifications: u.smsNotifications },
      channel,
      profile
    );
    if (eligibility === "ELIGIBLE") {
      recipients.push({ userId: u.id, name: u.name, email: u.email, phone: u.phone, locale, country: u.countryCode });
    } else {
      skipped.push({ userId: u.id, locale, reason: eligibility === "NEEDS_REVIEW" ? "NEEDS_CONSENT_REVIEW" : "NOT_ELIGIBLE" });
    }
  }

  return { recipients, skipped, truncated };
}
