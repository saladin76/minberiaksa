import "server-only";

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { CanonicalEvent, CanonicalEventName } from "@/lib/tracking/canonical";
import { rawCommand, firstBatch } from "@/lib/prisma-raw-command";

/**
 * Optional, anonymous *browser-reported* funnel telemetry, never a ledger of
 * bank receipts or evidence of payment. Disabled until reviewed on staging.
 * Stores no IP, phone, email, name, page URL, card or referrer.
 */
const COLLECTION = "FunnelObservation";
const QUOTA_COLLECTION = "FunnelObservationBudget";
const EVENTS = new Set<CanonicalEventName>([
  "view_content", "view_donation_page", "customize_product",
  "add_to_cart", "begin_checkout", "add_payment_info",
  "payment_submit", "payment_failed", "sign_up",
]);
const MAX_PER_MINUTE = 40;
const TTL_SECONDS = 60 * 60 * 24 * 7;
let indexesReady: Promise<void> | undefined;

export const funnelObservationEnabled = () => process.env.FUNNEL_OBSERVATION_ENABLED === "true";

export function sanitizeFunnelEvent(event: CanonicalEvent): {
  eventId: string; eventName: string; amount?: number; currency?: string; itemCount?: number;
} | null {
  if (!EVENTS.has(event.event) ||
      typeof event.event_id !== "string" ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(event.event_id)) return null;
  const value = event.donation?.amount ?? event.donation?.amount_usd;
  const amount = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e8
    ? value : undefined;
  const currency = typeof event.donation?.currency === "string" &&
    /^[A-Z]{3}$/.test(event.donation.currency) ? event.donation.currency : undefined;
  const itemCount = Array.isArray(event.items) ? Math.min(event.items.length, 100) : undefined;
  return {
    eventId: event.event_id,
    eventName: event.event,
    ...(amount !== undefined ? { amount } : {}),
    ...(currency ? { currency } : {}),
    ...(itemCount !== undefined ? { itemCount } : {}),
  };
}

async function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = (async () => {
      await prisma.$runCommandRaw(rawCommand({
        createIndexes: COLLECTION,
        indexes: [
          { key: { eventId: 1 }, name: "unique_funnel_event_id", unique: true },
          { key: { observedAt: -1, eventName: 1 }, name: "funnel_reporting_window" },
          { key: { observedAt: 1 }, name: "funnel_observation_ttl", expireAfterSeconds: TTL_SECONDS },
        ],
      }));
      await prisma.$runCommandRaw(rawCommand({
        createIndexes: QUOTA_COLLECTION,
        indexes: [{ key: { expiresAt: 1 }, name: "funnel_quota_ttl", expireAfterSeconds: 0 }],
      }));
    })().catch(error => { indexesReady = undefined; throw error; });
  }
  return indexesReady;
}

export async function recordFunnelObservation(event: CanonicalEvent, clientIp: string | undefined): Promise<"recorded" | "duplicate" | "rate_limited" | "disabled" | "invalid"> {
  if (!funnelObservationEnabled()) return "disabled";
  const safe = sanitizeFunnelEvent(event);
  if (!safe) return "invalid";
  if (!clientIp || !process.env.NEXTAUTH_SECRET) return "invalid";
  await ensureIndexes();

  const minute = Math.floor(Date.now() / 60_000);
  const actorId = crypto.createHmac("sha256", process.env.NEXTAUTH_SECRET)
    .update(clientIp + ":" + minute).digest("hex");
  const now = new Date();
  // Atomic budget across PM2 workers, not an in-memory per-process counter.
  const quota = await prisma.$runCommandRaw(rawCommand({
    findAndModify: QUOTA_COLLECTION,
    query: { _id: actorId },
    update: {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(now.getTime() + 120_000) },
    },
    upsert: true,
    new: true,
  }));
  const used = Number((quota as { value?: { count?: number } } | null)?.value?.count ?? MAX_PER_MINUTE + 1);
  if (used > MAX_PER_MINUTE) return "rate_limited";

  try {
    const response = await prisma.$runCommandRaw(rawCommand({
      insert: COLLECTION,
      documents: [{
        ...safe,
        // Even attacker-supplied event IDs are never persisted as plaintext:
        // they might contain guessed phone numbers or other identifiers.
        eventId: crypto.createHmac("sha256", process.env.NEXTAUTH_SECRET)
          .update(safe.eventId).digest("hex"),
        observedAt: now, channel: "browser_reported", source: "anonymous_client",
      }],
      ordered: true,
    }));
    return Number((response as { n?: number } | null)?.n ?? 0) === 1 ? "recorded" : "invalid";
  } catch (error) {
    if (/E11000|duplicate key/i.test(String(error))) return "duplicate";
    throw error;
  }
}

export async function readFunnelSummary(hours = 24): Promise<{
  enabled: boolean; hours: number; source: string; stages: Array<{ event: string; count: number }>;
}> {
  if (!funnelObservationEnabled()) return { enabled: false, hours, source: "browser_reported", stages: [] };
  const cutoff = new Date(Date.now() - Math.min(Math.max(hours, 1), 168) * 3_600_000);
  const response = await prisma.$runCommandRaw(rawCommand({
    aggregate: COLLECTION,
    pipeline: [
      { $match: { observedAt: { $gte: cutoff }, channel: "browser_reported" } },
      { $group: { _id: "$eventName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
    cursor: {},
  }));
  const stages = firstBatch(response).flatMap(row =>
    typeof row._id === "string" && typeof row.count === "number"
      ? [{ event: row._id, count: row.count }] : [],
  );
  return { enabled: true, hours, source: "browser_reported", stages };
}
