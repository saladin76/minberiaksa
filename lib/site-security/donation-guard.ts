import "server-only";
import { createHmac } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { securityClientIp } from "@/lib/site-security/policy";
import {
  type GuardCaseState, type GuardDecision, type GuardSettings,
  decideGuard, normalizeGuardSettings, normDevice, normEmail, normPhone, strictest,
} from "@/lib/site-security/donation-guard-policy";
import { TRUST_COOKIE, verifyTrustMark } from "@/lib/site-security/donation-trust";

/**
 * Donation guard — batch 1: OBSERVE ONLY.
 * Every card checkout is evaluated against the owner's freeze rule and the outcome
 * is recorded for review, but nothing is ever blocked yet ("ENFORCE" ships with the
 * donor-facing freeze screen and release requests in batch 2).
 * Fail-open: any error or timeout lets the donation through and is logged.
 * Stores only HMAC-hashed identity keys, never raw IPs, e-mails or phones.
 */
export const GUARD_SETTINGS = "DonationGuardSettings", GUARD_ATTEMPTS = "DonationGuardAttempt",
  GUARD_CASES = "DonationGuardCase", GUARD_EVENTS = "DonationGuardEvent";
const ENFORCEMENT_AVAILABLE = false; // batch 2 flips this together with the freeze screen.

type KeyType = "ip" | "device" | "email" | "phone";
type GuardKey = { type: KeyType; hash: string };
export type DonationGuardResult = { response: NextResponse | null; keys: GuardKey[] | null };
const PASS: DonationGuardResult = { response: null, keys: null };

const secret = () => process.env.DONATION_ABUSE_HASH_SECRET || process.env.NEXTAUTH_SECRET || "";
const hashKey = (type: KeyType, value: string) => createHmac("sha256", secret()).update(`mdg:${type}:${value}`).digest("hex").slice(0, 40);
const rows = (r: unknown) => ((r as { cursor?: { firstBatch?: Record<string, unknown>[] } })?.cursor?.firstBatch ?? []);
const raw = (cmd: Record<string, unknown>) => prisma.$runCommandRaw(cmd as Prisma.InputJsonObject);

let settingsCache: { at: number; value: GuardSettings } | null = null;
export async function readGuardSettings(): Promise<GuardSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 5000) return settingsCache.value;
  const r = await raw({ find: GUARD_SETTINGS, filter: { _id: "default" }, limit: 1, maxTimeMS: 1000 });
  const value = normalizeGuardSettings(rows(r)[0], process.env.DONATION_GUARD_MODE ?? null);
  settingsCache = { at: Date.now(), value };
  return value;
}

async function isTrusted(request: NextRequest, userId: string | null): Promise<boolean> {
  if (verifyTrustMark(request.cookies.get(TRUST_COOKIE)?.value, Date.now(), secret())) return true;
  if (userId && /^[a-f\d]{24}$/i.test(userId)) {
    const paid = await prisma.donation.findFirst({ where: { donorId: userId, status: "PAID", paidAt: { not: null } }, select: { id: true } });
    return Boolean(paid);
  }
  return false;
}

async function isKnownContact(email: string | null, phone: string | null): Promise<boolean> {
  const ids: string[] = [];
  if (email) { const u = await prisma.user.findUnique({ where: { email }, select: { id: true } }); if (u) ids.push(u.id); }
  if (phone) { const u = await prisma.user.findMany({ where: { phone: { in: ["+" + phone, phone] } }, select: { id: true }, take: 5 }); ids.push(...u.map((x) => x.id)); }
  if (!ids.length) return false;
  return Boolean(await prisma.donation.findFirst({ where: { donorId: { in: ids }, status: "PAID", paidAt: { not: null } }, select: { id: true } }));
}

async function unpaidSince(hash: string, from: number): Promise<number> {
  const r = await raw({ find: GUARD_ATTEMPTS, filter: { keys: hash, at: { $gte: from } }, projection: { donationIds: 1 }, limit: 200, maxTimeMS: 1000 });
  const ids = [...new Set(rows(r).flatMap((x) => (Array.isArray(x.donationIds) ? x.donationIds.map(String) : [])))].filter((id) => /^[a-f\d]{24}$/i.test(id));
  if (!ids.length) return 0;
  const paid = await prisma.donation.count({ where: { id: { in: ids }, status: "PAID" } });
  return ids.length - paid;
}

async function evaluateKey(key: GuardKey, now: number, known: boolean, s: GuardSettings): Promise<GuardDecision> {
  const existing = rows(await raw({ find: GUARD_CASES, filter: { _id: key.hash }, limit: 1, maxTimeMS: 1000 }))[0];
  const state: GuardCaseState | null = existing && typeof existing.phase === "string"
    ? { phase: existing.phase as GuardCaseState["phase"], cooldownUntil: Number(existing.cooldownUntil), probationSince: Number(existing.probationSince), blockedAt: existing.blockedAt == null ? undefined : Number(existing.blockedAt) }
    : null;
  const [inWindow, sinceProbation] = await Promise.all([
    unpaidSince(key.hash, now - s.windowMinutes * 60_000),
    state && state.phase !== "COOLDOWN" ? unpaidSince(key.hash, state.probationSince) : Promise.resolve(0),
  ]);
  const d = decideGuard({ state, unpaidInWindow: inWindow, unpaidSinceProbation: sinceProbation, now, known, settings: s });
  if (d.transition === "CLEARED" && !d.next) await raw({ delete: GUARD_CASES, deletes: [{ q: { _id: key.hash }, limit: 1 }] });
  else if (d.next && JSON.stringify(d.next) !== JSON.stringify(state)) {
    await raw({ update: GUARD_CASES, updates: [{ q: { _id: key.hash }, upsert: true, u: {
      $set: { keyType: key.type, ...d.next, monitor: s.mode !== "ENFORCE" || !ENFORCEMENT_AVAILABLE, known, updatedAt: now, lastUnpaid: d.transition === "BLOCKED" ? sinceProbation : inWindow },
      $setOnInsert: { createdAt: now } } }] });
  }
  if (d.transition === "FROZE" || d.transition === "BLOCKED") {
    await raw({ insert: GUARD_EVENTS, documents: [{ at: now, keyType: key.type, key: key.hash.slice(0, 12), transition: d.transition,
      mode: s.mode, enforced: false, known, unpaid: d.transition === "BLOCKED" ? sinceProbation : inWindow, expiresAt: now + 90 * 864e5 }] });
  }
  return d;
}

/**
 * Call before any donor or donation write in a card checkout. Batch 1 never returns a
 * response (observe only). Pass the result to recordDonationGuardAttempt after creation.
 */
export async function checkDonationGuard(request: NextRequest, ctx: {
  paymentMethod: string; userId: string | null; email?: unknown; phone?: unknown; deviceId?: unknown;
}): Promise<DonationGuardResult> {
  if (ctx.paymentMethod !== "CARD" || secret().length < 20) return PASS;
  const work = (async (): Promise<DonationGuardResult> => {
    const s = await readGuardSettings();
    if (s.mode === "OFF") return PASS;
    if (await isTrusted(request, ctx.userId)) return PASS;
    const email = normEmail(ctx.email), phone = normPhone(ctx.phone), device = normDevice(ctx.deviceId);
    const ip = securityClientIp(request.headers);
    const keys: GuardKey[] = [
      ...(ip ? [{ type: "ip" as const, hash: hashKey("ip", ip) }] : []),
      ...(device ? [{ type: "device" as const, hash: hashKey("device", device) }] : []),
      ...(email ? [{ type: "email" as const, hash: hashKey("email", email) }] : []),
      ...(phone ? [{ type: "phone" as const, hash: hashKey("phone", phone) }] : []),
    ];
    if (!keys.length) return PASS;
    const now = Date.now(), known = await isKnownContact(email, phone);
    const decision = strictest(await Promise.all(keys.map((k) => evaluateKey(k, now, known, s))));
    void decision; // batch 1: recorded above, never enforced.
    return { response: null, keys };
  })();
  try {
    return await Promise.race([work, new Promise<DonationGuardResult>((_, rej) => setTimeout(() => rej(new Error("GUARD_TIMEOUT")), 2500))]);
  } catch (error) {
    console.error("[donation-guard] check skipped (fail-open):", error instanceof Error ? error.message : "unknown");
    return PASS;
  }
}

/** Remember which identity keys produced these donations. Never throws. */
export function recordDonationGuardAttempt(guard: DonationGuardResult, donationIds: Array<string | null | undefined>): void {
  const ids = donationIds.filter((x): x is string => typeof x === "string" && /^[a-f\d]{24}$/i.test(x));
  if (!guard.keys?.length || !ids.length) return;
  const now = Date.now();
  void raw({ insert: GUARD_ATTEMPTS, documents: [{ at: now, keys: guard.keys.map((k) => k.hash), donationIds: ids, expiresAt: now + 8 * 864e5 }] })
    .then(() => (Math.random() < 0.02 ? raw({ delete: GUARD_ATTEMPTS, deletes: [{ q: { expiresAt: { $lt: now } }, limit: 0 }] }) : null))
    .catch((error) => console.error("[donation-guard] attempt not recorded:", error instanceof Error ? error.message : "unknown"));
}
