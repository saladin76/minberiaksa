import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { parseListKey } from "./audience-list-service";
import { countSmartAudience, getSmartAudienceDefinitionForList, loadSmartAudiencePage, previewSmartAudience, type SmartAudiencePreview } from "./smart-audience";
import { ensureProfilesForUsers } from "./donor-communication-profile-service";
import { recipientExclusionReason } from "./campaign-audience-accounting";
import type { AudienceLocaleCounts } from "./audience-preview-accounting";
import { readCampaignAudienceList, readCampaignListPage } from "./campaign-list-reader";

export type LocaleRecipientBreakdown = {
  locale: SupportedLocale; label: string; total: number; eligible: number;
  needsReview: number; missingContact: number; optedOut: number; doNotContact: number;
};
export type CampaignRecipientBreakdown = {
  channel: CommunicationChannelId; locales: LocaleRecipientBreakdown[];
  totals: Omit<LocaleRecipientBreakdown, "locale" | "label">;
  recipientLocaleCounts: Record<string, number>;
};

function combineBreakdown(channel: CommunicationChannelId, locales: LocaleRecipientBreakdown[]): CampaignRecipientBreakdown {
  const totals = locales.reduce((acc, row) => ({
    total: acc.total + row.total, eligible: acc.eligible + row.eligible,
    needsReview: acc.needsReview + row.needsReview, missingContact: acc.missingContact + row.missingContact,
    optedOut: acc.optedOut + row.optedOut, doNotContact: acc.doNotContact + row.doNotContact,
  }), { total: 0, eligible: 0, needsReview: 0, missingContact: 0, optedOut: 0, doNotContact: 0 });
  const recipientLocaleCounts: Record<string, number> = {};
  for (const row of locales) recipientLocaleCounts[row.locale] = row.eligible;
  return { channel, locales, totals, recipientLocaleCounts };
}

function breakdownFromPreview(channel: CommunicationChannelId, preview: SmartAudiencePreview): CampaignRecipientBreakdown {
  if (!("localeBreakdown" in preview)) throw new Error("AUDIENCE_BREAKDOWN_UNAVAILABLE");
  const buckets = preview.localeBreakdown as Record<string, AudienceLocaleCounts>;
  return combineBreakdown(channel, SUPPORTED_LOCALES.filter((locale) => buckets[locale]).map((locale) => ({
    locale, label: LOCALES[locale].label, ...buckets[locale], optedOut: 0,
  })));
}

async function profilesFor(ids: string[]) {
  return ids.length ? prisma.donorCommunicationProfile.findMany({
    where: { userId: { in: [...new Set(ids)] } },
    select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true },
  }) : [];
}

export async function getRecipientBreakdown(
  channel: CommunicationChannelId,
  opts: { locale?: string | null } = {},
): Promise<CampaignRecipientBreakdown> {
  const listId = parseListKey(opts.locale);
  if (listId) {
    const list = await readCampaignAudienceList(listId);
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) return breakdownFromPreview(channel, await previewSmartAudience({ ...smart, channel }, 0));
    if (list.type === "SMART") throw new Error("SMART_AUDIENCE_DEFINITION_UNAVAILABLE");
    const byLocale = new Map<SupportedLocale, LocaleRecipientBreakdown>();
    let cursor: string | null = null;
    // A saved-list preview walks all pages, not the detail screen's display cap.
    while (true) {
      const page: Awaited<ReturnType<typeof readCampaignListPage>> = await readCampaignListPage(listId, { limit: 1000, cursorId: cursor });
      const ids = page.members.filter((member) => !member.missingDonor).map((member) => member.userId);
      // Preserve the existing email/SMS bootstrap. Never infer WhatsApp consent.
      if (channel !== "WHATSAPP" && ids.length) await ensureProfilesForUsers(ids);
      const byUser = new Map((await profilesFor(ids)).map((profile) => [profile.userId, profile]));
      for (const member of page.members) {
        const row = byLocale.get(member.locale) ?? {
          locale: member.locale, label: LOCALES[member.locale].label,
          total: 0, eligible: 0, missingContact: 0, needsReview: 0, optedOut: 0, doNotContact: 0,
        };
        row.total += 1;
        const reason = member.missingDonor ? "RECIPIENT_NOT_FOUND" : recipientExclusionReason(member, channel, byUser.get(member.userId));
        if (reason === null) row.eligible += 1;
        else if (reason === "DO_NOT_CONTACT") row.doNotContact += 1;
        else if (reason === "MISSING_CONTACT") row.missingContact += 1;
        else row.needsReview += 1;
        byLocale.set(member.locale, row);
      }
      if (page.exhausted) break;
      if (!page.nextCursor || page.nextCursor === cursor) throw new Error("AUDIENCE_CURSOR_NOT_ADVANCING");
      cursor = page.nextCursor;
    }
    return combineBreakdown(channel, SUPPORTED_LOCALES.filter((locale) => byLocale.has(locale)).map((locale) => byLocale.get(locale)!));
  }
  return breakdownFromPreview(channel, await previewSmartAudience({
    version: 1, kind: "SMART", channel,
    filters: { locales: opts.locale && isValidLocale(opts.locale) ? [opts.locale] : [], hasContact: false },
  }, 0));
}

export type CampaignRecipient = {
  cursorId: string; userId: string; name: string | null; email: string | null;
  phone: string | null; locale: SupportedLocale; country: string | null;
};
export type RecipientLoadResult = {
  recipients: CampaignRecipient[];
  skipped: { cursorId: string; userId: string; locale: string; reason: string }[];
  truncated: boolean; nextCursor: string | null; exhausted: boolean;
};

export async function countCampaignAudience(audienceSegmentKey: string | null): Promise<number> {
  if (!process.env.DATABASE_URL) throw new Error("AUDIENCE_DATABASE_UNAVAILABLE");
  const listId = parseListKey(audienceSegmentKey);
  if (listId) {
    const list = await readCampaignAudienceList(listId);
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) return countSmartAudience(smart);
    if (list.type === "SMART") throw new Error("SMART_AUDIENCE_DEFINITION_UNAVAILABLE");
    return prisma.communicationAudienceMember.count({ where: { listId, status: "ACTIVE", contactType: "DONOR" } });
  }
  return prisma.user.count({ where: {
    role: "DONOR", ...(audienceSegmentKey && isValidLocale(audienceSegmentKey) ? { preferredLang: audienceSegmentKey } : {}),
  } });
}

/** Read failures reject the page. Consent rules remain those of the shared policy. */
export async function loadCampaignRecipients(
  channel: CommunicationChannelId,
  audienceSegmentKey: string | null,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<RecipientLoadResult> {
  const limit = Number.isFinite(opts.limit ?? 500) ? Math.max(1, Math.min(Math.floor(opts.limit ?? 500), 1000)) : 500;
  const cursor = opts.cursor ?? null;
  const listId = parseListKey(audienceSegmentKey);
  let members: Array<CampaignRecipient & { missingDonor?: boolean }>;
  let nextCursor: string | null;
  let exhausted: boolean;
  let bootstrapLegacy = true;
  if (listId) {
    const list = await readCampaignAudienceList(listId);
    const smart = await getSmartAudienceDefinitionForList(listId);
    if (smart) {
      const page = await loadSmartAudiencePage({ ...smart, channel }, { limit, cursorId: cursor });
      members = page.members.map((member) => ({ cursorId: member.id, userId: member.id, name: member.name, email: member.email, phone: member.phone, locale: member.locale, country: member.countryCode }));
      nextCursor = page.nextCursor;
      exhausted = page.exhausted;
      bootstrapLegacy = true;
    } else {
      if (list.type === "SMART") throw new Error("SMART_AUDIENCE_DEFINITION_UNAVAILABLE");
      const page = await readCampaignListPage(listId, { limit, cursorId: cursor });
      members = page.members.map((member) => ({ cursorId: member.memberId, userId: member.userId, name: member.name, email: member.email, phone: member.phone, locale: member.locale, country: member.country, missingDonor: member.missingDonor }));
      nextCursor = page.nextCursor;
      exhausted = page.exhausted;
    }
  } else {
    const users = await prisma.user.findMany({
      where: {
        role: "DONOR",
        ...(audienceSegmentKey && isValidLocale(audienceSegmentKey) ? { preferredLang: audienceSegmentKey } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, preferredLang: true, countryCode: true },
      orderBy: { id: "asc" }, take: limit,
    });
    members = users.map((user) => ({ cursorId: user.id, userId: user.id, name: user.name, email: user.email, phone: user.phone,
      locale: user.preferredLang && isValidLocale(user.preferredLang) ? user.preferredLang : DEFAULT_LOCALE, country: user.countryCode }));
    exhausted = users.length < limit;
    nextCursor = users.length ? users[users.length - 1].id : cursor;
  }
  const ids = members.filter((member) => !member.missingDonor).map((member) => member.userId);
  if (bootstrapLegacy && channel !== "WHATSAPP" && ids.length) await ensureProfilesForUsers(ids);
  const byUser = new Map((await profilesFor(ids)).map((profile) => [profile.userId, profile]));
  const recipients: CampaignRecipient[] = [];
  const skipped: RecipientLoadResult["skipped"] = [];
  for (const member of members) {
    const reason = member.missingDonor ? "RECIPIENT_NOT_FOUND" : recipientExclusionReason(member, channel, byUser.get(member.userId));
    if (reason === null) {
      recipients.push({ cursorId: member.cursorId, userId: member.userId, name: member.name, email: member.email, phone: member.phone, locale: member.locale, country: member.country });
    } else skipped.push({ cursorId: member.cursorId, userId: member.userId, locale: member.locale, reason });
  }
  return { recipients, skipped, truncated: !exhausted, nextCursor, exhausted };
}
