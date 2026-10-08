import type { Prisma } from "@prisma/client";
import type { AudienceChannel } from "./campaign-audience-accounting";

/**
 * Database form of recipientExclusionReason for the campaign picker.
 * MongoDB distinguishes absent fields from null: spell out both sides of
 * each filter instead of negating a compound predicate that drops absences.
 * This is read-only; viewing or selecting an audience never creates consent.
 */
export function campaignCandidateWhere(
  base: Prisma.UserWhereInput,
  channel: AudienceChannel,
  eligibility: string,
): Prisma.UserWhereInput {
  if (eligibility !== "eligible" && eligibility !== "ineligible") return base;
  const contact = channel === "EMAIL" ? "email" : "phone";
  const preference = channel === "EMAIL" ? "emailOptIn" : channel === "SMS" ? "smsOptIn" : "whatsappOptIn";
  const contactPresent: Prisma.UserWhereInput = {
    AND: [{ [contact]: { not: null } }, { [contact]: { not: "" } }],
  };
  const missingContact: Prisma.UserWhereInput = {
    OR: [{ [contact]: null }, { [contact]: "" }, { [contact]: { isSet: false } }],
  };
  const approvedProfile: Prisma.DonorCommunicationProfileWhereInput = {
    [preference]: true,
    OR: [{ doNotContact: false }, { doNotContact: { isSet: false } }],
  };
  const blockedProfile: Prisma.DonorCommunicationProfileWhereInput = {
    OR: [{ doNotContact: true }, { [preference]: false }, { [preference]: { isSet: false } }],
  };
  const gate: Prisma.UserWhereInput = eligibility === "eligible"
    ? { AND: [contactPresent, { communicationProfile: { is: approvedProfile } }] }
    : { OR: [missingContact, { communicationProfile: { is: null } }, { communicationProfile: { is: blockedProfile } }] };
  return { AND: [base, gate] };
}

/** Reject NaN, fractions and oversized skips rather than sending them to Prisma. */
export function candidatePagination(pageValue: string | null, limitValue: string | null): { page: number; limit: number } | null {
  const page = pageValue === null || pageValue === "" ? 1 : Number(pageValue);
  const requested = limitValue === null || limitValue === "" ? 25 : Number(limitValue);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) return null;
  if (!Number.isSafeInteger(requested) || requested < 1) return null;
  return { page, limit: Math.min(100, requested) };
}
