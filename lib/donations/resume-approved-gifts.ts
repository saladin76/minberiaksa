import "server-only";
import { prisma } from "@/lib/prisma";
import { giftNotDelivered } from "./gift-delivery-state";
import { deliverDonationGifts } from "./gift-delivery";
import { recoverApprovalBlockedGifts } from "./gift-recovery";

/** Bounded work per cron run, not an audience or recipient sending limit. */
export async function resumeApprovedGifts() {
  const rows = await prisma.donationItem.findMany({
    where: { AND: [giftNotDelivered], giftDeliveryError: { contains: "GIFT_TEMPLATE_APPROVAL_REQUIRED" }, donation: { paidAt: { not: null } } },
    orderBy: { updatedAt: "asc" }, take: 25,
    select: { donationId: true, giftChannels: true, giftDeliveryState: true, donation: { select: { paidAt: true } } },
  });
  return recoverApprovalBlockedGifts(rows.map(row => ({ donationId: row.donationId, paidAt: row.donation.paidAt, channels: row.giftChannels, deliveryState: row.giftDeliveryState })), deliverDonationGifts);
}
