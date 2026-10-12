import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { clientKey, hit } from "@/lib/ai/concierge/rate-limit";

/**
 * Card-testing brakes for the charges that send a typed card straight to a bank
 * (Albaraka 2D sale): no 3D Secure step stands between a bot holding a list of
 * stolen cards and the terminal, and a run of declines gets the terminal closed.
 *
 * Three layers, cheapest first:
 *  - per caller address: a donor retries a typo a few times, a bot hundreds;
 *  - per card: the same number tried over and over with guessed CVCs/expiries;
 *  - site-wide: when declines spike across every address at once (a bot on
 *    rotating IPs), card charges pause for everyone until the window passes.
 *
 * The first two are per server instance (see `rate-limit.ts`); the third reads
 * the database, so it holds across instances and restarts.
 */

const PER_IP_SHORT = { limit: 5, windowMs: 10 * 60_000 };
const PER_IP_DAY = { limit: 20, windowMs: 24 * 60 * 60_000 };
const PER_CARD = { limit: 3, windowMs: 60 * 60_000 };
const SITE_WINDOW_MS = 15 * 60_000;
const SITE_DECLINE_LIMIT = Number(process.env.CARD_DECLINE_CIRCUIT_LIMIT || 40);

export type CardAttemptVerdict =
  | { ok: true }
  | { ok: false; reason: "ip" | "card" | "site"; retryAfterSeconds: number };

/** One-way fingerprint so the limiter never holds a card number in memory. */
function cardFingerprint(cardNo: string): string {
  return crypto.createHash("sha256").update(`card-attempt:${cardNo}`).digest("base64url").slice(0, 22);
}

export async function checkCardAttempt(
  headers: Headers,
  cardNo: string,
  provider: string
): Promise<CardAttemptVerdict> {
  const ipKey = clientKey(headers, `card-${provider}`);
  const short = hit(`${ipKey}:short`, PER_IP_SHORT.limit, PER_IP_SHORT.windowMs);
  if (!short.ok) return { ok: false, reason: "ip", retryAfterSeconds: short.retryAfterSeconds };
  const day = hit(`${ipKey}:day`, PER_IP_DAY.limit, PER_IP_DAY.windowMs);
  if (!day.ok) return { ok: false, reason: "ip", retryAfterSeconds: day.retryAfterSeconds };

  const card = hit(`card-${provider}:${cardFingerprint(cardNo)}`, PER_CARD.limit, PER_CARD.windowMs);
  if (!card.ok) return { ok: false, reason: "card", retryAfterSeconds: card.retryAfterSeconds };

  try {
    const recentDeclines = await prisma.donation.count({
      where: {
        provider,
        status: "FAILED",
        createdAt: { gte: new Date(Date.now() - SITE_WINDOW_MS) },
      },
    });
    if (recentDeclines >= SITE_DECLINE_LIMIT) {
      console.error(`[card-attempts] ${provider} paused: ${recentDeclines} declines in the last 15 minutes`);
      return { ok: false, reason: "site", retryAfterSeconds: Math.ceil(SITE_WINDOW_MS / 1000) };
    }
  } catch (err) {
    // A failed count must not block a real donor; the per-address limits still hold.
    console.error("[card-attempts] decline count failed:", err);
  }
  return { ok: true };
}
