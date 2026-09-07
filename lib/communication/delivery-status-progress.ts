import type { DeliveryStatusId } from "./communication-runtime-types";

/**
 * Forward-only progression guard shared by every provider webhook (Elastic Email, Brevo SMS).
 *
 * Engagement statuses form a ladder. Providers do not guarantee event ordering, so a late `sent`
 * must never downgrade a delivery that already reached `clicked`. Terminal outcomes
 * (failure/bounce/unsubscribe) are always applied — they are the final word regardless of order.
 */

const PROGRESS_RANK: Partial<Record<string, number>> = {
  SENT_TO_PROVIDER: 1,
  SENT: 2,
  DELIVERED: 3,
  OPENED: 4,
  READ: 4,
  CLICKED: 5,
};

const TERMINAL: readonly DeliveryStatusId[] = ["FAILED", "BOUNCED", "UNSUBSCRIBED"];

export function shouldApplyDeliveryStatus(current: string | null | undefined, next: DeliveryStatusId): boolean {
  if (TERMINAL.includes(next)) return current !== next;
  const currentRank = PROGRESS_RANK[current ?? ""] ?? 0;
  const nextRank = PROGRESS_RANK[next] ?? 0;
  return nextRank > currentRank;
}
