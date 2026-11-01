import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isValidLocale } from "@/lib/locales";
import type { CommunicationChannelId } from "./communication-runtime-types";

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
  const rows = await prisma.communicationAudienceMember.aggregateRaw({ pipeline: [
    { $match: { listId: { $oid: listId }, contactType: "DONOR", status: "ACTIVE", userId: { $type: "objectId" } } },
    { $lookup: { from: "User", localField: "userId", foreignField: "_id", as: "donors" } },
    { $unwind: "$donors" },
    { $match: { "donors.role": "DONOR" } },
    { $lookup: { from: "DonorCommunicationProfile", localField: "userId", foreignField: "userId", as: "profiles" } },
    { $set: { donor: "$donors", profile: { $ifNull: [{ $arrayElemAt: ["$profiles", 0] }, {}] } } },
    { $match: { $expr: { $and: eligible } } },
    { $group: { _id: { $cond: [{ $in: ["$donor.preferredLang", [...SUPPORTED_LOCALES]] }, "$donor.preferredLang", DEFAULT_LOCALE] }, count: { $sum: 1 } } },
  ] as never, options: { maxTimeMS: 15_000 } });
  if (!Array.isArray(rows)) throw new Error("AUDIENCE_LANGUAGE_COUNTS_UNAVAILABLE");
  const counts: Record<string, number> = {};
  for (const row of rows as Array<{_id: unknown; count: unknown}>) {
    if (typeof row._id !== "string" || !isValidLocale(row._id) || typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 0 || Object.hasOwn(counts, row._id)) throw new Error("INVALID_AUDIENCE_LANGUAGE_COUNT");
    counts[row._id] = row.count;
  }
  return counts;
}
