/**
 * Thin re-export of the canonical event id helpers so future modules can
 * `import { stableDonateEventId } from "@/lib/tracking/stable-event-id"` without
 * coupling to `canonical.ts`. Kept separate to mirror the Tracking Control
 * Center module layout.
 */
import { metaDonationEventId } from "@/lib/tracking/canonical";

/** Stable, idempotent event id for a donation row. Used for Meta CAPI / GA4 MP dedup. */
export function stableDonateEventId(
  donationId: string,
  kind: "success" | "failed" = "success"
): string {
  return metaDonationEventId(donationId, kind);
}

/** Reverse-lookup: parse the donation id out of a stable event id. Returns null on bad input. */
export function parseDonationIdFromEventId(eventId: string): string | null {
  if (!eventId) return null;
  const success = /^donate_([A-Za-z0-9]+)$/.exec(eventId);
  if (success) return success[1];
  const failed = /^donate_([A-Za-z0-9]+)_failed$/.exec(eventId);
  if (failed) return failed[1];
  return null;
}
