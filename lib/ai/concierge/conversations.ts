import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findAttributedDonations, type AttributedDonation, type ConciergeRange } from "./analytics";

/**
 * Filtering concierge conversations  one definition shared by the dashboard
 * list and the insights run, so "the conversations I am looking at" and "the
 * conversations the AI read" are always the same set.
 */

export interface ConversationFilters {
  locale?: string | null;
  intent?: string | null;
  /** donated: direct or indirect donation linked; direct / none narrow it. */
  outcome?: "donated" | "direct" | "none" | null;
  needsHuman?: boolean;
  fallback?: boolean;
  signedIn?: boolean;
  /** Only conversations where the visitor typed at least one message. */
  typedOnly?: boolean;
  q?: string | null;
}

export function parseConversationFilters(p: URLSearchParams): ConversationFilters {
  const outcome = p.get("outcome");
  return {
    locale: p.get("locale") || null,
    intent: p.get("intent") || null,
    outcome: outcome === "donated" || outcome === "direct" || outcome === "none" ? outcome : null,
    needsHuman: p.get("needsHuman") === "1",
    fallback: p.get("fallback") === "1",
    signedIn: p.get("signedIn") === "1",
    typedOnly: p.get("typedOnly") === "1",
    q: p.get("q")?.trim().slice(0, 120) || null,
  };
}

export function sanitizeConversationFilters(raw: unknown): ConversationFilters {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const s = (v: unknown, max = 60) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return {
    locale: s(o.locale, 5),
    intent: s(o.intent, 40),
    outcome: o.outcome === "donated" || o.outcome === "direct" || o.outcome === "none" ? o.outcome : null,
    needsHuman: o.needsHuman === true,
    fallback: o.fallback === true,
    signedIn: o.signedIn === true,
    typedOnly: o.typedOnly === true,
    q: s(o.q, 120),
  };
}

/** Donations per session in the range (direct first), for outcome filters and badges. */
export async function donationsBySession(range: ConciergeRange, windowDays: number) {
  /* A donation can land up to `windowDays` after the chat, so look that far past the range. */
  const donations = await findAttributedDonations({
    from: range.from,
    to: new Date(Math.min(Date.now(), range.to.getTime() + windowDays * 24 * 60 * 60 * 1000)),
    windowDays,
  });
  const map = new Map<string, AttributedDonation[]>();
  for (const d of donations) {
    if (!d.sessionId) continue;
    if (!map.has(d.sessionId)) map.set(d.sessionId, []);
    map.get(d.sessionId)!.push(d);
  }
  return map;
}

export function conversationWhere(
  range: ConciergeRange,
  f: ConversationFilters,
  bySession: Map<string, AttributedDonation[]> | null
): Prisma.AiConciergeConversationWhereInput {
  const and: Prisma.AiConciergeConversationWhereInput[] = [{ startedAt: { gte: range.from, lte: range.to } }];
  if (f.locale) and.push({ locale: f.locale });
  if (f.intent) and.push({ intents: { has: f.intent } });
  if (f.needsHuman) and.push({ needsHuman: true });
  if (f.fallback) and.push({ fallbackCount: { gt: 0 } });
  if (f.signedIn) and.push({ userId: { not: null } });
  if (f.typedOnly) and.push({ userMessageCount: { gt: 0 } });
  if (f.q) and.push({ turns: { some: { text: { contains: f.q, mode: "insensitive" } } } });
  if (f.outcome && bySession) {
    const donated = [...bySession.entries()];
    if (f.outcome === "donated") and.push({ sessionId: { in: donated.map(([s]) => s) } });
    if (f.outcome === "direct") and.push({ sessionId: { in: donated.filter(([, list]) => list.some((d) => d.kind === "direct")).map(([s]) => s) } });
    if (f.outcome === "none") and.push({ sessionId: { notIn: donated.map(([s]) => s) } });
  }
  return { AND: and };
}

export function needsDonationLookup(f: ConversationFilters): boolean {
  return Boolean(f.outcome);
}
