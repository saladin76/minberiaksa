import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifySourceChannel } from "@/lib/attribution/source-channel";

export const dynamic = "force-dynamic";

/**
 * Classifies donations that have no sourceChannel yet (every 10 minutes from the VPS cron; the first run
 * backfills history in batches). Reads only the attribution field, writes only sourceChannel.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || "";
  const got = request.headers.get("authorization") || "";
  const want = `Bearer ${secret}`;
  return Boolean(secret) && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

type RawDoc = { _id: { $oid: string } | string; attribution?: unknown };

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(5000, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 1000));
  const docs = (await prisma.donation.aggregateRaw({
    pipeline: [{ $match: { sourceChannel: { $exists: false } } }, { $sort: { _id: -1 } }, { $limit: limit }, { $project: { attribution: 1 } }],
  })) as unknown as RawDoc[];
  const byChannel: Record<string, number> = {};
  const updates = docs.map((d) => {
    const id = typeof d._id === "string" ? d._id : d._id.$oid;
    const channel = classifySourceChannel(d.attribution);
    byChannel[channel] = (byChannel[channel] ?? 0) + 1;
    return { q: { _id: { $oid: id } }, u: { $set: { sourceChannel: channel } } };
  });
  for (let i = 0; i < updates.length; i += 500) {
    await prisma.$runCommandRaw({ update: "Donation", updates: updates.slice(i, i + 500), ordered: false });
  }
  const left = (await prisma.donation.aggregateRaw({ pipeline: [{ $match: { sourceChannel: { $exists: false } } }, { $count: "n" }] })) as unknown as Array<{ n: number }>;
  return NextResponse.json({ ok: true, classified: updates.length, byChannel, remaining: left[0]?.n ?? 0 });
}

export const GET = run;
export const POST = run;
