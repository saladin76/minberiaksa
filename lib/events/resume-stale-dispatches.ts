import { prisma } from "@/lib/prisma";
import { dispatchEvent, type MessageTriggerEvent } from "@/lib/events/dispatch";

/**
 * Re-runs donor notifications that were claimed and never finished.
 *
 * `dispatchEvent` takes a ten-minute lease (`EventDispatchClaim`, state
 * IN_PROGRESS) before it sends, and only an expired lease can be taken over.
 * Nothing used to come back for one: a function killed mid-send left the donor
 * without a receipt for good. This finds those leases and dispatches again;
 * the takeover inside `dispatchEvent` keeps it once-only even if two sweeps
 * overlap. Each claim is retried for up to a day, then left for staff.
 */
const MAX_PER_RUN = 20;
const GIVE_UP_AFTER_MS = 24 * 60 * 60_000;

type StaleClaim = { _id: string; event: string; donationId: string };

export async function resumeStaleDispatches(): Promise<{ found: number; resumed: number; failed: number }> {
  const now = Date.now();
  const raw = (await prisma.$runCommandRaw({
    find: "EventDispatchClaim",
    filter: {
      state: "IN_PROGRESS",
      leaseExpiresAt: { $lte: { $date: new Date(now).toISOString() } },
      createdAt: { $gte: { $date: new Date(now - GIVE_UP_AFTER_MS).toISOString() } },
    },
    projection: { event: 1, donationId: 1 },
    limit: MAX_PER_RUN,
  })) as { cursor?: { firstBatch?: StaleClaim[] } };
  const claims = raw.cursor?.firstBatch ?? [];

  let resumed = 0;
  let failed = 0;
  for (const claim of claims) {
    if (!claim.donationId || !claim.event) continue;
    try {
      await dispatchEvent(claim.event as MessageTriggerEvent, { donationId: String(claim.donationId) });
      resumed++;
    } catch (error) {
      failed++;
      console.error("[resume-stale-dispatches] dispatch failed", {
        key: claim._id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { found: claims.length, resumed, failed };
}
