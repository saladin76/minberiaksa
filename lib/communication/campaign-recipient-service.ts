import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { parseListKey, loadListMembers, loadListMembersPage } from "./audience-list-service";
import { countSmartAudience, getSmartAudienceDefinitionForList, loadSmartAudiencePage, previewSmartAudience, type SmartAudiencePreview } from "./smart-audience";
import { ensureProfilesForUsers } from "./donor-communication-profile-service";
import { recipientExclusionReason } from "./campaign-audience-accounting";
import type { AudienceLocaleCounts } from "./audience-preview-accounting";

/** Audience membership is retained. These counts explain preliminary send eligibility. */
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
  recipientLocaleCounts: Record<string, number>;
};

function combineBreakdown(channel: CommunicationChannelId, locales: LocaleRecipientBreakdown[]): CampaignRecipientBreakdown {
  const totals = locales.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      eligible: acc.eligible + row.eligible,
      needsReview: acc.needsReview + row.needsReview,
      missingContact: acc.missingContact + row.missingContact,
      optedOut: acc.optedOut + row.optedOut,
      doNotContact: acc.doNotContact + row.doNotContact,
    }),
    { total: 0, eligible: 0, needsReview: 0, missingContact: 0, optedOut: 0, doNotContact: 0 },
  );
  const recipientLocaleCounts: Record<string, number> = {};
  for (const row of locales) recipientLocaleCounts[row.locale] = row.eligible;
  return { channel, locales, totals, recipientLocaleCounts };
}

function breakdownFromPreview(channel: CommunicationChannelId, preview: SmartAudiencePreview): CampaignRecipientBreakdown {
  // The accounting engine returns this extra detail; reject incompatible previews
  // rather than filling language-level exclusions with invented zeroes.
  if (!("localeBreakdown" in preview)) throw new Error("AUDIENCE_BREAKDOWN_UNAVAILABLE");
  const buckets = preview.localeBreakdown as Record<string, AudienceLocaleCounts>;
  const locales = SUPPORTED_LOCALES.filter((locale) => buckets[locale]).map((locale) => ({
    locale,
    label: LOCALES[locale].label,
    ...buckets[locale],
    // A false/default opt-in does not prove an explicit unsubscribe. It belongs
    // in needsReview; only a recorded doNotContact is reported as a DNC request.
    optedOut: 0,
  }));
  return combineBreakdown(channel, locales);
}

export async function getRecipientBreakdown(
  channel: CommunicationChannelId,
  opts: { locale?: string | null } = {},
): Promise<CampaignRecipientBreakdown> {
  const listId = parseListKey(opts.locale);
  if (listId) {
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) return breakdownFromPreview(channel, await previewSmartAudience({ ...smart, channel }, 0));

    // Test contacts are reserved for dedicated test sends, not campaign execution.
    const members = (await loadListMembers(listId)).filter((m) => m.contactType === "DONOR" && m.userId);
    const ids = [...new Set(members.map((m) => m.userId!))];
    if (channel !== "WHATSAPP" && ids.length) await ensureProfilesForUsers(ids);
    const profiles = ids.length ? await prisma.donorCommunicationProfile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true },
    }) : [];
    const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    const byLocale = new Map<SupportedLocale, LocaleRecipientBreakdown>();
    for (const member of members) {
      const row = byLocale.get(member.locale) ?? {
        locale: member.locale, label: LOCALES[member.locale].label,
        total: 0, eligible: 0, missingContact: 0, needsReview: 0, optedOut: 0, doNotContact: 0,
      };
      row.total += 1;
      const reason = recipientExclusionReason(member, channel, byUser.get(member.userId!));
      if (reason === null) row.eligible += 1;
      else if (reason === "DO_NOT_CONTACT") row.doNotContact += 1;
      else if (reason === "MISSING_CONTACT") row.missingContact += 1;
      else row.needsReview += 1;
      byLocale.set(member.locale, row);
    }
    return combineBreakdown(channel, SUPPORTED_LOCALES.filter((locale) => byLocale.has(locale)).map((locale) => byLocale.get(locale)!));
  }

  const preview = await previewSmartAudience({
    version: 1, kind: "SMART", channel,
    filters: { locales: opts.locale && isValidLocale(opts.locale) ? [opts.locale] : [], hasContact: false },
  }, 0);
  return breakdownFromPreview(channel, preview);
}

export type CampaignRecipient = {
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
  truncated: boolean;
  nextCursor: string | null;
  exhausted: boolean;
};

/** Counts selected members, never the size of one batch or guaranteed delivery. */
export async function countCampaignAudience(audienceSegmentKey: string | null): Promise<number> {
  if (!process.env.DATABASE_URL) throw new Error("AUDIENCE_DATABASE_UNAVAILABLE");
  const listId = parseListKey(audienceSegmentKey);
  if (listId) {
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) return countSmartAudience(smart);
    return prisma.communicationAudienceMember.count({ where: { listId, status: "ACTIVE", contactType: "DONOR" } });
  }
  return prisma.user.count({ where: {
    role: "DONOR",
    ...(audienceSegmentKey && isValidLocale(audienceSegmentKey) ? { preferredLang: audienceSegmentKey } : {}),
  } });
}

/**
 * Walk all selected members by cursor. Each page returns either a candidate or
 * an explicit skip reason for every resolved donor. A read failure is an error,
 * not an empty profile map or a completed audience. No provider calls here.
 */
export async function loadCampaignRecipients(
  channel: CommunicationChannelId,
  audienceSegmentKey: string | null,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<RecipientLoadResult> {
  const limit = Number.isFinite(opts.limit ?? 500) ? Math.max(1, Math.min(Math.floor(opts.limit ?? 500), 1000)) : 500;
  const cursor = opts.cursor ?? null;
  const listId = parseListKey(audienceSegmentKey);
  if (listId) {
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) {
      const { members, nextCursor, exhausted } = await loadSmartAudiencePage({ ...smart, channel }, { limit, cursorId: cursor });
      const userIds = members.map((member) => member.id);
      const profiles = userIds.length ? await prisma.donorCommunicationProfile.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true },
      }) : [];
      const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));
      const recipients: CampaignRecipient[] = [];
      const skipped: RecipientLoadResult["skipped"] = [];
      for (const member of members) {
        const reason = recipientExclusionReason(member, channel, byUser.get(member.id));
        if (reason === null) {
          recipients.push({ cursorId: member.id, userId: member.id, name: member.name, email: member.email, phone: member.phone, locale: member.locale, country: member.countryCode });
        } else {
          skipped.push({ cursorId: member.id, userId: member.id, locale: member.locale, reason });
        }
      }
      return { recipients, skipped, truncated: !exhausted, nextCursor, exhausted };
    }

    const { members, nextCursor, exhausted } = await loadListMembersPage(listId, { limit, cursorId: cursor });
    const donorIds = members.filter((member) => member.contactType === "DONOR" && member.userId).map((member) => member.userId!);
    if (channel !== "WHATSAPP" && donorIds.length) await ensureProfilesForUsers(donorIds);
    const profiles = donorIds.length ? await prisma.donorCommunicationProfile.findMany({
      where: { userId: { in: donorIds } },
      select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true },
    }) : [];
    const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    const recipients: CampaignRecipient[] = [];
    const skipped: RecipientLoadResult["skipped"] = [];
    for (const member of members) {
      if (member.contactType !== "DONOR" || !member.userId) continue;
      const reason = recipientExclusionReason(member, channel, byUser.get(member.userId));
      if (reason === null) {
        recipients.push({ cursorId: member.memberId, userId: member.userId, name: member.name, email: member.email, phone: member.phone, locale: member.locale, country: member.country });
      } else {
        skipped.push({ cursorId: member.memberId, userId: member.userId, locale: member.locale, reason });
      }
    }
    return { recipients, skipped, truncated: !exhausted, nextCursor, exhausted };
  }

  const users = await prisma.user.findMany({
    where: {
      role: "DONOR",
      ...(audienceSegmentKey && isValidLocale(audienceSegmentKey) ? { preferredLang: audienceSegmentKey } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, preferredLang: true, countryCode: true },
    orderBy: { id: "asc" }, take: limit,
  });
  const exhausted = users.length < limit;
  const nextCursor = users.length ? users[users.length - 1].id : cursor;
  const userIds = users.map((user) => user.id);
  if (channel !== "WHATSAPP" && userIds.length) await ensureProfilesForUsers(userIds);
  const profiles = userIds.length ? await prisma.donorCommunicationProfile.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true },
  }) : [];
  const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  const recipients: CampaignRecipient[] = [];
  const skipped: RecipientLoadResult["skipped"] = [];
  for (const user of users) {
    const locale = user.preferredLang && isValidLocale(user.preferredLang) ? user.preferredLang : DEFAULT_LOCALE;
    const reason = recipientExclusionReason(user, channel, byUser.get(user.id));
    if (reason === null) {
      recipients.push({ cursorId: user.id, userId: user.id, name: user.name, email: user.email, phone: user.phone, locale, country: user.countryCode });
    } else {
      skipped.push({ cursorId: user.id, userId: user.id, locale, reason });
    }
  }
  return { recipients, skipped, truncated: !exhausted, nextCursor, exhausted };
}
