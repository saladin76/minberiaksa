import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isValidLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { previewConsentForLegacyDonor, recipientExclusionReason } from "./campaign-audience-accounting";

/** The same candidate policy as the list loader, without paging contacts to Node. */
export async function countSavedListLanguages(listId: string, channel: CommunicationChannelId): Promise<Record<string, number>> {
  if (!/^[a-f0-9]{24}$/i.test(listId)) throw new Error("INVALID_AUDIENCE_LIST");
  const contact = channel === "EMAIL" ? "$donor.email" : "$donor.phone";
  const consent = { $ifNull: ["$profile.consentSource", ""] };
  const eligible: unknown[] = [
    { $ne: [{ $ifNull: ["$profile.doNotContact", false] }, true] },
    { $ne: [{ $ifNull: [contact, ""] }, ""] },
  ];
  if (channel === "WHATSAPP") eligible.push({ $ne: [consent, "meta-whatsapp-inbound-opt-out"] });
  if (channel === "EMAIL") eligible.push({ $not: [{ $regexMatch: { input: consent, regex: "^elastic-email:(?:unsubscribe|complaint|hard-bounce)$|email-unsubscribe", options: "i" } }] });
  if (channel === "SMS") eligible.push({ $cond: [
    { $gt: [{ $size: "$profiles" }, 0] },
    { $eq: ["$profile.smsOptIn", true] },
    { $ne: [{ $ifNull: ["$donor.smsNotifications", true] }, false] },
  ] });
  let rows: unknown;
  try { rows = await prisma.communicationAudienceMember.aggregateRaw({ pipeline: [
    { $match: { listId: { $oid: listId }, contactType: "DONOR", status: "ACTIVE", userId: { $type: "objectId" } } },
    { $lookup: { from: "User", localField: "userId", foreignField: "_id", as: "donors" } },
    { $unwind: "$donors" },
    { $match: { "donors.role": "DONOR" } },
    { $lookup: { from: "DonorCommunicationProfile", localField: "userId", foreignField: "userId", as: "profiles" } },
    { $set: { donor: "$donors", profile: { $ifNull: [{ $arrayElemAt: ["$profiles", 0] }, {}] } } },
    { $match: { $expr: { $and: eligible } } },
    { $group: { _id: { $cond: [{ $in: ["$donor.preferredLang", [...SUPPORTED_LOCALES]] }, "$donor.preferredLang", DEFAULT_LOCALE] }, count: { $sum: 1 } } },
  ] as never, options: { maxTimeMS: 15_000 } }); }
  catch { return countSavedListLanguagesByPage(listId, channel); }
  if (!Array.isArray(rows)) throw new Error("AUDIENCE_LANGUAGE_COUNTS_UNAVAILABLE");
  const counts: Record<string, number> = {};
  for (const row of rows as Array<{_id: unknown; count: unknown}>) {
    if (typeof row._id !== "string" || !isValidLocale(row._id) || typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 0 || Object.hasOwn(counts, row._id)) throw new Error("INVALID_AUDIENCE_LANGUAGE_COUNT");
    counts[row._id] = row.count;
  }
  return counts;
}

/** Same policy as the aggregate, with bounded, read-only queries. Never turn a
 * failed page into zero eligible contacts or a partially covered audience. */
async function countSavedListLanguagesByPage(listId: string, channel: CommunicationChannelId) {
  const counts: Record<string, number> = {};
  let cursor: string | undefined;
  for (;;) {
    const members = await prisma.communicationAudienceMember.findMany({
      where: { listId, contactType: "DONOR", status: "ACTIVE", ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" }, take: 1000, select: { id: true, userId: true },
    });
    const ids = [...new Set(members.flatMap(row => row.userId ? [row.userId] : []))];
    const [donors, profiles] = ids.length ? await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids }, role: "DONOR" }, select: { id: true, email: true, phone: true, preferredLang: true, smsNotifications: true } }),
      prisma.donorCommunicationProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, doNotContact: true, smsOptIn: true, consentSource: true } }),
    ]) : [[], []];
    const donorMap = new Map(donors.map(row => [row.id, row]));
    const profileMap = new Map(profiles.map(row => [row.userId, row]));
    for (const member of members) {
      if (cursor && member.id <= cursor) throw new Error("AUDIENCE_CURSOR_NOT_ADVANCING");
      cursor = member.id;
      const donor = member.userId ? donorMap.get(member.userId) : undefined;
      if (!donor || recipientExclusionReason(donor, channel, previewConsentForLegacyDonor(donor, channel, profileMap.get(donor.id))) !== null) continue;
      const locale = donor.preferredLang && isValidLocale(donor.preferredLang) ? donor.preferredLang : DEFAULT_LOCALE;
      counts[locale] = (counts[locale] ?? 0) + 1;
    }
    if (members.length < 1000) return counts;
  }
}
