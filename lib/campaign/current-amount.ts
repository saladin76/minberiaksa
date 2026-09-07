import type { Prisma } from "@prisma/client";

/**
 * Campaign / category progress totals.
 *
 *   currentAmount = baselineAmount + settled donation items
 *
 * `baselineAmount` is money raised OUTSIDE the site (cash, bank transfer, a legacy system)
 * that an admin entered by hand through the campaign edit form. It has no donation rows
 * behind it, so ANY recompute driven purely by `DonationItem` must add it back.
 *
 * This exists because the previous recompute was an absolute overwrite from donation rows
 * only, fired on every donation DELETE and PATCH. On a campaign carrying a $15,698 offline
 * baseline, editing a single unrelated donation silently reset the public total to the
 * donation-only figure and destroyed the baseline permanently.
 *
 * "Settled" is strict here — `status: PAID` AND `paidAt` set. Subscription rows that are
 * still unsettled show as ناجح on dashboards (see PAID_DONATION_FILTER) but must not move
 * campaign totals until the gateway confirms, or the webhook's own increment double-counts.
 */

type Tx = Prisma.TransactionClient;

/** Strict settled donation-item total for one campaign. */
export async function settledCampaignItemTotal(tx: Tx, campaignId: string): Promise<number> {
  const rows = await tx.donationItem.findMany({
    where: { campaignId, donation: { status: "PAID", paidAt: { not: null } } },
    select: { amount: true, amountUSD: true },
  });
  return rows.reduce((sum, row) => sum + (row.amountUSD ?? row.amount), 0);
}

/** Strict settled donation-category-item total for one category. */
export async function settledCategoryItemTotal(tx: Tx, categoryId: string): Promise<number> {
  const rows = await tx.donationCategoryItem.findMany({
    where: { categoryId, donation: { status: "PAID", paidAt: { not: null } } },
    select: { amount: true, amountUSD: true },
  });
  return rows.reduce((sum, row) => sum + (row.amountUSD ?? row.amount), 0);
}

/** Rebuild currentAmount as baselineAmount + settled items. Safe after any donation change. */
export async function recomputeCampaignCurrentAmount(tx: Tx, campaignId: string): Promise<void> {
  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    select: { baselineAmount: true },
  });
  if (!campaign) return;
  const settled = await settledCampaignItemTotal(tx, campaignId);
  await tx.campaign.update({
    where: { id: campaignId },
    data: { currentAmount: (campaign.baselineAmount ?? 0) + settled },
  });
}

/** Rebuild category currentAmount as baselineAmount + settled items. */
export async function recomputeCategoryCurrentAmount(tx: Tx, categoryId: string): Promise<void> {
  const category = await tx.category.findUnique({
    where: { id: categoryId },
    select: { baselineAmount: true },
  });
  if (!category) return;
  const settled = await settledCategoryItemTotal(tx, categoryId);
  await tx.category.update({
    where: { id: categoryId },
    data: { currentAmount: (category.baselineAmount ?? 0) + settled },
  });
}

/**
 * An admin typed a total into the campaign edit form. Honour it exactly, and record the part
 * that donations don't explain as the offline baseline so later recomputes preserve it.
 * A desired total BELOW the settled donation total yields a baseline of 0 rather than a
 * negative one — the donations are real and can't be subtracted away.
 */
export async function setCampaignDisplayTotal(
  tx: Tx,
  campaignId: string,
  desiredTotal: number
): Promise<void> {
  const settled = await settledCampaignItemTotal(tx, campaignId);
  const baseline = Math.max(0, desiredTotal - settled);
  await tx.campaign.update({
    where: { id: campaignId },
    data: { baselineAmount: baseline, currentAmount: baseline + settled },
  });
}
