import { prisma } from "@/lib/prisma";

export type DonationRelationFilterInput = {
  campaignId?: string | null;
  categoryId?: string | null;
};

export type DonationRelationFilterIds = {
  /** null means no project filter; [] means the selected project has no donations. */
  campaignDonationIds: string[] | null;
  /** null means no category filter; [] means the selected category has no donations. */
  categoryDonationIds: string[] | null;
  /** null means no category filter; [] means the category has no campaigns. */
  categoryCampaignIds: string[] | null;
};

/**
 * Resolve dashboard filters through the scalar foreign-key columns. The
 * donation table can then be queried by its own indexed ObjectId field instead
 * of asking Prisma/Mongo to traverse multiple relation collections per row.
 */
export async function resolveDonationRelationFilterIds({
  campaignId,
  categoryId,
}: DonationRelationFilterInput): Promise<DonationRelationFilterIds> {
  const selectedCampaignId = campaignId && campaignId !== "all" ? campaignId : null;
  const selectedCategoryId = categoryId && categoryId !== "all" ? categoryId : null;

  const [campaignItems, categoryCampaigns, categoryItems] = await Promise.all([
    selectedCampaignId
      ? prisma.donationItem.findMany({
          where: { campaignId: selectedCampaignId },
          select: { donationId: true },
        })
      : Promise.resolve(null),
    selectedCategoryId
      ? prisma.campaign.findMany({
          where: { categoryIds: { has: selectedCategoryId } },
          select: { id: true },
        })
      : Promise.resolve(null),
    selectedCategoryId
      ? prisma.donationCategoryItem.findMany({
          where: { categoryId: selectedCategoryId },
          select: { donationId: true },
        })
      : Promise.resolve(null),
  ]);

  const categoryCampaignIds = categoryCampaigns?.map(({ id }) => id) ?? null;
  const categoryCampaignItems = categoryCampaignIds?.length
    ? await prisma.donationItem.findMany({
        where: { campaignId: { in: categoryCampaignIds } },
        select: { donationId: true },
      })
    : selectedCategoryId
      ? []
      : null;

  const categoryDonationIds = selectedCategoryId
    ? [
        ...new Set([
          ...(categoryCampaignItems ?? []).map(({ donationId }) => donationId),
          ...(categoryItems ?? []).map(({ donationId }) => donationId),
        ]),
      ]
    : null;

  return {
    campaignDonationIds:
      campaignItems == null
        ? null
        : [...new Set(campaignItems.map(({ donationId }) => donationId))],
    categoryDonationIds,
    categoryCampaignIds,
  };
}

/** Resolve recurring plans through their scalar subscription item links. */
export async function resolveSubscriptionRelationFilterIds({
  campaignId,
  categoryId,
  categoryCampaignIds,
}: DonationRelationFilterInput & {
  categoryCampaignIds?: readonly string[] | null;
}): Promise<{ campaignSubscriptionIds: string[] | null; categorySubscriptionIds: string[] | null }> {
  const selectedCampaignId = campaignId && campaignId !== "all" ? campaignId : null;
  const selectedCategoryId = categoryId && categoryId !== "all" ? categoryId : null;
  const campaignIds = categoryCampaignIds ? [...categoryCampaignIds] : [];

  const [campaignItems, categoryCampaignItems, categoryItems] = await Promise.all([
    selectedCampaignId
      ? prisma.subscriptionItem.findMany({
          where: { campaignId: selectedCampaignId },
          select: { subscriptionId: true },
        })
      : Promise.resolve(null),
    selectedCategoryId && campaignIds.length
      ? prisma.subscriptionItem.findMany({
          where: { campaignId: { in: campaignIds } },
          select: { subscriptionId: true },
        })
      : Promise.resolve(null),
    selectedCategoryId
      ? prisma.subscriptionCategoryItem.findMany({
          where: { categoryId: selectedCategoryId },
          select: { subscriptionId: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    campaignSubscriptionIds:
      campaignItems == null
        ? null
        : [...new Set(campaignItems.map(({ subscriptionId }) => subscriptionId))],
    categorySubscriptionIds:
      selectedCategoryId == null
        ? null
        : [
            ...new Set([
              ...(categoryCampaignItems ?? []).map(({ subscriptionId }) => subscriptionId),
              ...(categoryItems ?? []).map(({ subscriptionId }) => subscriptionId),
            ]),
          ],
  };
}
