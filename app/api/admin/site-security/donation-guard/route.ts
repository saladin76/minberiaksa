import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { GUARD_ATTEMPTS, GUARD_CASES, GUARD_EVENTS, readGuardSettings } from "@/lib/site-security/donation-guard";

export const dynamic = "force-dynamic";
const rows = (r: unknown) => ((r as { cursor?: { firstBatch?: Record<string, unknown>[] } })?.cursor?.firstBatch ?? []);
const raw = (cmd: Record<string, unknown>) => prisma.$runCommandRaw(cmd as Prisma.InputJsonObject);

/** Admin-only, read-only overview of the donation guard (hashed keys only, no personal data). */
export async function GET() {
  const denied = requireAdminSession(await getServerSession(authOptions));
  if (denied) return denied;
  try {
    const now = Date.now(), week = now - 7 * 864e5;
    const [settings, events, recent, cases, attempts] = await Promise.all([
      readGuardSettings(),
      raw({ aggregate: GUARD_EVENTS, pipeline: [{ $match: { at: { $gte: week } } }, { $group: { _id: { t: "$transition", k: "$keyType", known: "$known" }, n: { $sum: 1 } } }], cursor: {}, maxTimeMS: 3000 }),
      raw({ find: GUARD_EVENTS, filter: {}, sort: { at: -1 }, limit: 50, projection: { _id: 0, expiresAt: 0 }, maxTimeMS: 3000 }),
      raw({ aggregate: GUARD_CASES, pipeline: [{ $group: { _id: "$phase", n: { $sum: 1 } } }], cursor: {}, maxTimeMS: 3000 }),
      raw({ count: GUARD_ATTEMPTS, query: { at: { $gte: now - 864e5 } }, maxTimeMS: 3000 }),
    ]);
    return NextResponse.json({
      settings, enforcementAvailable: false,
      last7Days: rows(events).map((r) => ({ ...(r._id as object), count: r.n })),
      recentEvents: rows(recent).map((e) => ({ ...e, at: new Date(Number(e.at)).toISOString() })),
      openCases: Object.fromEntries(rows(cases).map((r) => [String(r._id), r.n])),
      cardAttemptsLast24h: (attempts as { n?: number }).n ?? 0,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[donation-guard] overview failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "GUARD_OVERVIEW_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
