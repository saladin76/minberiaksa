import { readGiftDeliveryState } from "./gift-delivery-state";

export type RecoverableGift = { donationId: string; paidAt: Date | string | null; channels: string[]; deliveryState: unknown };

/** Only definitely unsent, approval-blocked WhatsApp gifts. A previously
 * accepted email is skipped by deliverDonationGifts; uncertain sends are held. */
export async function recoverApprovalBlockedGifts(rows: RecoverableGift[], deliver: (id: string) => Promise<{ whatsappSent: number; errors: number }>) {
  const ids = new Set<string>();
  for (const row of rows) {
    const state = readGiftDeliveryState(row.deliveryState);
    if (row.paidAt && row.channels.includes("WHATSAPP") && state.WHATSAPP?.status === "FAILED" && state.WHATSAPP.reason === "GIFT_TEMPLATE_APPROVAL_REQUIRED") ids.add(row.donationId);
  }
  const result = { eligible: ids.size, resumed: 0, failed: 0 };
  for (const id of ids) {
    try { const sent = await deliver(id); result.resumed += sent.whatsappSent; if (sent.errors) result.failed++; }
    catch { result.failed++; }
  }
  return result;
}
