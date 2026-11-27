import "server-only";
import { prisma } from "@/lib/prisma";
import { giftNotDelivered } from "./gift-delivery-state";
import { deliverDonationGifts } from "./gift-delivery";
import { recoverApprovalBlockedGifts } from "./gift-recovery";

/**
 * Gifts scheduled on the gift page (giftSendAt) whose time has come and that were never attempted:
 * each donation is handed to the ordinary delivery, which sends only its due lines. Bounded per run.
 */
export async function deliverDueScheduledGifts(now = new Date()): Promise<number> {
  const due = { giftSendAt: { lte: now }, AND: [giftNotDelivered, { OR: [{ giftDeliveryError: null }, { giftDeliveryError: { isSet: false } }] }], donation: { paidAt: { not: null } } };
  const [items, waqf] = await Promise.all([
    prisma.donationItem.findMany({ where: due, orderBy: { giftSendAt: "asc" }, take: 25, select: { donationId: true } }),
    typeof prisma.donationWaqfItem?.findMany === "function" ? prisma.donationWaqfItem.findMany({ where: due, orderBy: { giftSendAt: "asc" }, take: 25, select: { donationId: true } }) : Promise.resolve([] as { donationId: string }[]),
  ]);
  const ids = [...new Set([...items, ...waqf].map(row => row.donationId))];
  for (const id of ids) await deliverDonationGifts(id).catch(error => console.error("[gift-delivery] scheduled:", error instanceof Error ? error.message : error));
  return ids.length;
}

/** Bounded work per cron run, not an audience or recipient sending limit. */
export async function resumeApprovedGifts() {
  try { await deliverDueScheduledGifts(); } catch (error) { console.error("[gift-delivery] scheduled sweep:", error instanceof Error ? error.message : error); }
  const rows = await prisma.donationItem.findMany({
    where: { AND: [giftNotDelivered], giftDeliveryError: { contains: "GIFT_TEMPLATE_APPROVAL_REQUIRED" }, donation: { paidAt: { not: null } } },
    orderBy: { updatedAt: "asc" }, take: 25,
    select: { donationId: true, giftChannels: true, giftDeliveryState: true, donation: { select: { paidAt: true } } },
  });
  return recoverApprovalBlockedGifts(rows.map(row => ({ donationId: row.donationId, paidAt: row.donation.paidAt, channels: row.giftChannels, deliveryState: row.giftDeliveryState })), id => deliverDonationGifts(id, { approvalBlockedOnly: true }));
}
