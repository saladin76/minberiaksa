/**
 * The sidebar badge for the finance queue (`إيصالات التحويل`).
 *
 * The layout polls `/api/admin/transfer-receipts/pending-count` once a minute;
 * the review page fires this event as it decides, so the number moves with
 * the click rather than a minute later. Mirrors `INBOX_UNREAD_EVENT`.
 */
export const TRANSFER_RECEIPTS_PENDING_EVENT = "transfer-receipts:pending";

/** Push the exact count (from a fresh fetch) or a delta (after one decision). */
export function emitTransferReceiptsPending(detail: { count: number } | { delta: number }): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TRANSFER_RECEIPTS_PENDING_EVENT, { detail }));
}
