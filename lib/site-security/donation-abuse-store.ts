import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import {
  advanceProtection,
  initialProtectionState,
  paymentRestriction,
  releaseProtection,
  type PaymentEvidence,
  type PaymentSignal,
  type ProtectionState,
} from "./donation-abuse-policy";

export const DONATION_ABUSE_COLLECTION = "DonationAbuseActorState";
export type FraudActorRecord = {
  id: string;
  revision: number;
  state: ProtectionState;
  lastEventAt: number;
  releasedBy: string | null;
  releasedReason: string | null;
};
const safeInteger = (raw: unknown): number => {
  if (typeof raw === "number") return Number.isSafeInteger(raw) ? raw : NaN;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const n = Number(obj.$numberLong ?? obj.$numberInt ?? obj.$numberDouble ?? NaN);
    return Number.isSafeInteger(n) ? n : NaN;
  }
  return NaN;
};
const rowsOf = (raw: unknown): Record<string, unknown>[] => {
  const data = raw as { ok?: number; cursor?: { firstBatch?: unknown[] } };
  if (data?.ok !== 1 || !Array.isArray(data.cursor?.firstBatch))
    throw new Error("FRAUD_STATE_READ_FAILED");
  return data.cursor.firstBatch.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object"));
};
export function donationAbuseActorId(ip: string): string {
  if (!isIP(ip)) throw new Error("UNTRUSTED_FRAUD_ACTOR_IP");
  const key = process.env.DONATION_ABUSE_HASH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!key || key.length < 20) throw new Error("FRAUD_HASH_SECRET_UNAVAILABLE");
  return createHmac("sha256", key).update("payment-fraud-ip:v1:" + ip).digest("hex");
}
function parseRecord(row: Record<string, unknown>): FraudActorRecord {
  const revision = safeInteger(row.revision);
  const raw = row.state as Record<string, unknown> | null;
  if (!Number.isSafeInteger(revision) || revision < 1 || !raw ||
      !["NORMAL", "COOLDOWN", "PROBATION", "REVIEW_BLOCK"].includes(String(raw.phase)))
    throw new Error("INVALID_FRAUD_STATE");
  const startedAt = safeInteger(raw.startedAt);
  const failedAttempts = safeInteger(raw.failedAttempts);
  if (!Number.isFinite(startedAt) || !Number.isFinite(failedAttempts))
    throw new Error("INVALID_FRAUD_STATE");
  const until = raw.until === null ? null : safeInteger(raw.until);
  if (until !== null && !Number.isFinite(until)) throw new Error("INVALID_FRAUD_STATE");
  if (!Array.isArray(raw.processedEventIds) ||
      raw.processedEventIds.some((x) => typeof x !== "string"))
    throw new Error("INVALID_FRAUD_STATE");
  return {
    id: String(row._id),
    revision,
    state: {
      phase: raw.phase as ProtectionState["phase"],
      startedAt,
      until,
      failedAttempts,
      processedEventIds: raw.processedEventIds as string[],
    },
    lastEventAt: safeInteger(row.lastEventAt) || 0,
    releasedBy: typeof row.releasedBy === "string" ? row.releasedBy : null,
    releasedReason: typeof row.releasedReason === "string" ? row.releasedReason : null,
  };
}
async function findById(id: string): Promise<FraudActorRecord | null> {
  const result = await prisma.$runCommandRaw({
    find: DONATION_ABUSE_COLLECTION, filter: { _id: id }, limit: 1, maxTimeMS: 1500,
  });
  const rows = rowsOf(result);
  return rows.length ? parseRecord(rows[0]) : null;
}
export async function findDonationAbuseActorByIp(ip: string): Promise<FraudActorRecord | null> {
  return findById(donationAbuseActorId(ip));
}
export async function inspectDonationAbuseRestriction(ip: string, now = Date.now()) {
  const row = await findDonationAbuseActorByIp(ip);
  return row
    ? { ...paymentRestriction(row.state, now), state: row.state.phase }
    : { blocked: false, reason: null, retryAt: null, state: "NORMAL" };
}
/**
 * Signed provider callbacks must supply a unique event identifier after
 * verifying authenticity and settlement. Never call this with a client
 * assertion, cancelled checkout, pending confirmation or transport error.
 */
export async function recordVerifiedDonationFailure(input: {
  ip: string;
  provider: string;
  paymentId: string;
  providerEventId: string;
  failure: Extract<PaymentSignal, "BANK_DECLINED" | "CARD_VALIDATION" | "AUTHENTICATION_FAILED">;
  at?: number;
}): Promise<FraudActorRecord> {
  if (process.env.DONATION_ABUSE_GUARD_ENABLED !== "true")
    throw new Error("FRAUD_GUARD_DISABLED");
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(input.provider) ||
      !input.providerEventId || input.providerEventId.length > 200 ||
      !input.paymentId || input.paymentId.length > 200)
    throw new Error("INVALID_VERIFIED_FAILURE");
  const id = donationAbuseActorId(input.ip);
  const now = input.at ?? Date.now();
  const evidence: PaymentEvidence = {
    eventId: createHmac("sha256", id).update(input.provider + ":" + input.providerEventId).digest("hex"),
    paymentId: input.paymentId,
    at: now,
    result: input.failure,
  };
  for (let retry = 0; retry < 5; retry++) {
    const prior = await findById(id);
    const state = advanceProtection(prior?.state ?? initialProtectionState(now), evidence, now);
    if (prior && state === prior.state) return prior; // exact duplicate event
    const result = await prisma.$runCommandRaw({
      findAndModify: DONATION_ABUSE_COLLECTION,
      query: prior
        ? { _id: id, revision: prior.revision }
        : { _id: id, revision: { $exists: false } },
      update: {
        $set: { state, lastEventAt: now, updatedAt: { $date: new Date(now).toISOString() } },
        $inc: { revision: 1 },
      },
      upsert: !prior, new: true, maxTimeMS: 2000,
    }).catch(() => null) as { ok?: number; value?: Record<string, unknown> | null } | null;
    if (result?.ok === 1 && result.value) return parseRecord(result.value);
  }
  throw new Error("FRAUD_STATE_CONCURRENT_WRITE");
}
export async function releaseDonationAbuseActor(input: {
  actorId: string; expectedRevision: number; operatorId: string; reason: string;
}): Promise<FraudActorRecord> {
  if (!/^[a-f0-9]{64}$/.test(input.actorId) ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 ||
      input.reason.trim().length < 10 || input.reason.length > 300)
    throw new Error("INVALID_FRAUD_RELEASE");
  const prior = await findById(input.actorId);
  if (!prior || prior.revision !== input.expectedRevision)
    throw new Error("FRAUD_STATE_STALE");
  const now = Date.now();
  const response = await prisma.$runCommandRaw({
    findAndModify: DONATION_ABUSE_COLLECTION,
    query: { _id: input.actorId, revision: input.expectedRevision },
    update: { $set: {
      // Preserve processed provider event IDs: replaying an old signed webhook after an\n      // administrator unblocks an actor must not count as a fresh decline.\n      state: { ...releaseProtection(now), processedEventIds: prior.state.processedEventIds },
      releasedBy: input.operatorId,
      releasedReason: input.reason.trim(),
      updatedAt: { $date: new Date(now).toISOString() },
    }, $inc: { revision: 1 } },
    new: true, maxTimeMS: 2000,
  }) as { ok?: number; value?: Record<string, unknown> | null };
  if (response.ok !== 1 || !response.value) throw new Error("FRAUD_STATE_STALE");
  return parseRecord(response.value);
}
export async function listRestrictedDonationActors(): Promise<FraudActorRecord[]> {
  const result = await prisma.$runCommandRaw({
    find: DONATION_ABUSE_COLLECTION,
    filter: { $or: [{ "state.phase": "REVIEW_BLOCK" }, { "state.phase": "COOLDOWN", "state.until": { $gt: Date.now() } }] },
    sort: { lastEventAt: -1 }, limit: 100, maxTimeMS: 2000,
  });
  return rowsOf(result).map(parseRecord);
}
