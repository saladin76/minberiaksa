import type { Prisma } from "@prisma/client";
import type { AudienceChannel } from "./campaign-audience-accounting";

/**
 * Apply optional readiness filtering BEFORE count and pagination. Profile IDs
 * are resolved read-only using the shared policy, because required Prisma Bool
 * fields cannot use MongoDB's isSet filter. Never cast an unsupported filter.
 */
export function campaignCandidateWhere(
  base: Prisma.UserWhereInput,
  channel: AudienceChannel,
  eligibility: string,
  consentingUserIds?: readonly string[],
): Prisma.UserWhereInput {
  if (eligibility !== "eligible" && eligibility !== "ineligible") return base;
  if (!consentingUserIds) throw new Error("CAMPAIGN_ELIGIBILITY_NOT_RESOLVED");
  const contact = channel === "EMAIL" ? "email" : "phone";
  const contactPresent: Prisma.UserWhereInput = {
    AND: [{ [contact]: { not: null } }, { [contact]: { not: "" } }],
  };
  const missingContact: Prisma.UserWhereInput = {
    OR: [{ [contact]: null }, { [contact]: "" }, { [contact]: { isSet: false } }],
  };
  const ids = [...new Set(consentingUserIds)];
  const gate: Prisma.UserWhereInput = eligibility === "eligible"
    ? { AND: [contactPresent, { id: { in: ids } }] }
    : { OR: [missingContact, { id: { notIn: ids } }] };
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
