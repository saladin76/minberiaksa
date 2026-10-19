import type { Prisma } from "@prisma/client";
import type { AudienceChannel } from "./campaign-audience-accounting";

/**
 * Apply optional readiness filtering BEFORE count and pagination. Resolved IDs
 * mean DNC exclusions for WhatsApp, permitted profiles for email/SMS. Using a
 * WhatsApp exclusion set keeps donors with no profile eligible without writing
 * or manufacturing consent. Required Prisma Boolean fields use model defaults.
 */
export function campaignCandidateWhere(
  base: Prisma.UserWhereInput,
  channel: AudienceChannel,
  eligibility: string,
  profileGateUserIds?: readonly string[],
): Prisma.UserWhereInput {
  if (eligibility !== "eligible" && eligibility !== "ineligible") return base;
  if (!profileGateUserIds) throw new Error("CAMPAIGN_ELIGIBILITY_NOT_RESOLVED");
  const contact = channel === "EMAIL" ? "email" : "phone";
  const contactPresent: Prisma.UserWhereInput = {
    AND: [{ [contact]: { not: null } }, { [contact]: { not: "" } }],
  };
  const missingContact: Prisma.UserWhereInput = {
    OR: [{ [contact]: null }, { [contact]: "" }, { [contact]: { isSet: false } }],
  };
  const ids = [...new Set(profileGateUserIds)];
  const allowedIds = channel === "WHATSAPP" ? { id: { notIn: ids } } : { id: { in: ids } };
  const blockedIds = channel === "WHATSAPP" ? { id: { in: ids } } : { id: { notIn: ids } };
  const gate: Prisma.UserWhereInput = eligibility === "eligible"
    ? { AND: [contactPresent, allowedIds] }
    : { OR: [missingContact, blockedIds] };
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

