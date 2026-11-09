import { isVerifiedReturningDonor, bypassProgressiveFraudBlock } from "@/lib/site-security/trusted-donor";
import { inspectDonationAbuseRestriction } from "@/lib/site-security/donation-abuse-store";
import "server-only";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { securityClientIp } from "@/lib/site-security/policy";

/**
 * Emergency initiation budget, separate from confirmed payment-decline policy.
 * Server-side and shared across instances through one atomic Mongo findAndModify.
 * Does not block browsing, callbacks, successful checkout returns or renewals.
 */
const COLLECTION = "DonationPaymentInitiationBudget";
const WINDOW_MS = 5 * 60_000;
const ipLimit = 8;
const donationLimit = 3;
type CheckResult = { accepted: boolean; retryAfterSeconds: number };
function identity(scope: "ip" | "donation" | "intake", value: string, bucket: number) {
  const secret = process.env.DONATION_ABUSE_HASH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 20) throw new Error("PAYMENT_BUDGET_KEY_UNAVAILABLE");
  return createHmac("sha256", secret).update(scope + ":" + value + ":" + bucket).digest("hex");
}
async function count(scope: "ip" | "donation" | "intake", value: string, limit: number, now: number): Promise<CheckResult> {
  const bucket = Math.floor(now / WINDOW_MS);
  // Each bucket's immutable identity makes upserts concurrency-safe with a unique _id.
  const result = await prisma.$runCommandRaw({
    findAndModify: COLLECTION,
    query: { _id: identity(scope, value, bucket) },
    update: {
      $inc: { attempts: 1 },
      $setOnInsert: {
        scope,
        createdAt: { $date: new Date(now).toISOString() },
        expiresAt: { $date: new Date((bucket + 1) * WINDOW_MS + 24 * 3600_000).toISOString() },
      },
    },
    upsert: true,
    new: true,
    maxTimeMS: 2000,
  }) as { ok?: number; value?: { attempts?: number | { $numberInt?: string; $numberLong?: string } } };
  if (result.ok !== 1 || !result.value) throw new Error("PAYMENT_BUDGET_UNAVAILABLE");
  const raw = result.value.attempts;
  const attempts = typeof raw === "number" ? raw : Number(raw?.$numberInt ?? raw?.$numberLong);
  if (!Number.isFinite(attempts)) throw new Error("PAYMENT_BUDGET_INVALID");
  return { accepted: attempts <= limit, retryAfterSeconds: Math.max(1, Math.ceil(((bucket + 1) * WINDOW_MS - now) / 1000)) };
}

/**
 * Use before any new provider initiation. Missing trusted proxy IP is never
 * replaced with an attacker-supplied forwarded header. Donation ID is a second
 * independently enforced budget, not a substitute for authentication.
 */
export async function enforcePaymentInitiationBudget(
  request: NextRequest,
  donationId?: string | null,
): Promise<NextResponse | null> {
  if (process.env.DONATION_ABUSE_GUARD_ENABLED !== "true") return null;
  const now = Date.now();
  try {
    const ip = securityClientIp(request.headers);
    // Limit the request's donation identity even when no trustworthy IP is available.
    // The IP limit applies site-wide across all guarded Stripe initiation routes.
    if (ip) {
      const trusted = await isVerifiedReturningDonor(donationId);
      if (!bypassProgressiveFraudBlock(trusted)) {
        const fraud = await inspectDonationAbuseRestriction(ip, now);
        if (fraud.blocked) return fraudReply(fraud.reason, fraud.retryAt, now);
      }
      const decision = await count("ip", ip, ipLimit, now);
      if (!decision.accepted) return rateLimit(decision.retryAfterSeconds);
    }
    if (donationId && /^[a-f0-9]{24}$/i.test(donationId)) {
      const decision = await count("donation", donationId, donationLimit, now);
      if (!decision.accepted) return rateLimit(decision.retryAfterSeconds);
    }
    return null;
  } catch {
    return NextResponse.json(
      { error: "PAYMENT_SECURITY_TEMPORARILY_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}
function rateLimit(seconds: number) {
  return NextResponse.json(
    { error: "PAYMENT_TOO_MANY_ATTEMPTS", retryAfterSeconds: seconds },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(seconds) } },
  );
}

/**
 * Reject high-volume creation of distinct guest/card donation records before
 * donor resolution or any downstream payment request. This is an independent
 * scope from provider initiation, so a normal checkout is not double-counted.
 */
export async function enforceDonationIntakeBudget(request: NextRequest): Promise<NextResponse | null> {
  if (process.env.DONATION_ABUSE_GUARD_ENABLED !== "true") return null;
  const ip = securityClientIp(request.headers);
  if (!ip) return null; // Never infer identity from a spoofable request header.
  try {
    const now = Date.now();
    const trusted = await isVerifiedReturningDonor();
    if (!bypassProgressiveFraudBlock(trusted)) {
      const fraud = await inspectDonationAbuseRestriction(ip, now);
      if (fraud.blocked) return fraudReply(fraud.reason, fraud.retryAt, now);
    }
    const decision = await count("intake", ip, 12, now);
    return decision.accepted ? null : rateLimit(decision.retryAfterSeconds);
  } catch {
    return NextResponse.json(
      { error: "PAYMENT_SECURITY_TEMPORARILY_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}

function fraudReply(reason: "COOLDOWN" | "MANUAL_REVIEW" | null, retryAt: number | null, now: number) {
  const seconds = retryAt === null ? null : Math.max(1, Math.ceil((retryAt - now) / 1000));
  return NextResponse.json(
    { error: reason === "MANUAL_REVIEW" ? "PAYMENT_REVIEW_BLOCKED" : "PAYMENT_COOLDOWN", retryAfterSeconds: seconds },
    { status: reason === "MANUAL_REVIEW" ? 423 : 429,
      headers: { "Cache-Control": "no-store", ...(seconds ? { "Retry-After": String(seconds) } : {}) } },
  );
}
