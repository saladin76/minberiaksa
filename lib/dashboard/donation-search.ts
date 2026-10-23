import type { Prisma } from "@prisma/client";

/** Search a donor's searchable identity fields without traversing relations. */
export function userWhereForDonorSearch(search: string): Prisma.UserWhereInput {
  const term = search.trim();
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { phone: { contains: term, mode: "insensitive" } },
    ],
  };
}

/** Search project names and their localized titles without traversing donations. */
export function campaignWhereForDonationSearch(search: string): Prisma.CampaignWhereInput {
  const term = search.trim();
  return { title: { contains: term, mode: "insensitive" } };
}

/** Search localized project titles via the translation table's scalar field. */
export function campaignTranslationWhereForDonationSearch(
  search: string,
): Prisma.CampaignTranslationWhereInput {
  return { title: { contains: search.trim(), mode: "insensitive" } };
}

/** Search category names and their localized names without traversing donations. */
export function categoryWhereForDonationSearch(search: string): Prisma.CategoryWhereInput {
  const term = search.trim();
  return { name: { contains: term, mode: "insensitive" } };
}

/** Search localized category names via the translation table's scalar field. */
export function categoryTranslationWhereForDonationSearch(
  search: string,
): Prisma.CategoryTranslationWhereInput {
  return { name: { contains: search.trim(), mode: "insensitive" } };
}

/**
 * MongoDB-safe donation filter after matching donor records by scalar fields.
 * The Donation model stores donorId as an ObjectId-backed scalar, so this
 * avoids unsupported relation filters and substring matching on ObjectIds.
 */
export function donationWhereForDonorSearch(
  donorIds: readonly string[],
  matchingDonationIds: readonly string[] = [],
): Prisma.DonationWhereInput {
  const OR: Prisma.DonationWhereInput[] = [];
  if (donorIds.length > 0) OR.push({ donorId: { in: [...donorIds] } });
  if (matchingDonationIds.length > 0) {
    OR.push(donationWhereForIds(matchingDonationIds));
  }
  return OR.length > 0 ? { OR } : { id: { in: [] } };
}

/** Filter donations from a prior lookup against a scalar donation link. */
export function donationWhereForIds(
  donationIds: readonly string[],
): Prisma.DonationWhereInput {
  return { id: { in: [...new Set(donationIds)] } };
}

/** Combine the donation IDs found through several equivalent category links. */
export function uniqueDonationIds(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flat())];
}
