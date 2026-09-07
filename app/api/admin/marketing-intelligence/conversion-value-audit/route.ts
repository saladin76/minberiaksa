import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

function isMap(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberParam(request: NextRequest, key: string, fallback: number, min: number, max: number) {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;
}

function paidTotal(row: { amount: number; teamSupport: number; fees: number; totalAmount: number }) {
  const total = Number(row.totalAmount ?? 0);
  if (Number.isFinite(total) && total > 0) return total;
  const fallback = Number(row.amount || 0) + Number(row.teamSupport || 0) + Number(row.fees || 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

function legacyOid(id: string) {
  return /^[a-f0-9]{24}$/i.test(id) ? { $oid: id } : id;
}

async function conversionValues(donationId: string) {
  const result = await prisma.$runCommandRaw({
    find: "ConversionEvent",
    filter: {
      eventName: { $in: ["Donate", "purchase"] },
      $or: [
        { donationId },
        { donationId: legacyOid(donationId) },
        { eventId: `donate_${donationId}` },
        { dedupKey: `donate_${donationId}` },
      ],
    },
    projection: { platform: 1, channel: 1, status: 1, value: 1, currency: 1, eventId: 1, createdAt: 1, sentAt: 1 },
    sort: { createdAt: -1 },
    limit: 20,
  }) as JsonMap;
  return isMap(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const days = numberParam(request, "days", 7, 1, 90);
  const limit = numberParam(request, "limit", 100, 1, 300);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const donations = await prisma.donation.findMany({
    where: { status: "PAID", paidAt: { not: null, gte: since } },
    orderBy: { paidAt: "desc" },
    take: limit,
    select: { id: true, paidAt: true, amount: true, teamSupport: true, fees: true, totalAmount: true, currency: true, conversionEventsSentAt: true },
  });

  const rows = [];
  for (const donation of donations) {
    const expected = paidTotal(donation);
    const base = donation.amount;
    const delta = expected - base;
    const events = await conversionValues(donation.id);
    const eventValues = events.map((event) => ({
      platform: String(event.platform || "UNKNOWN"),
      channel: String(event.channel || "server"),
      status: String(event.status || "UNKNOWN"),
      value: typeof event.value === "number" ? event.value : null,
      currency: String(event.currency || donation.currency),
      eventId: String(event.eventId || ""),
    }));
    const hasUndercountedEvent = eventValues.some((event) => typeof event.value === "number" && Math.abs(event.value - base) < 0.01 && delta > 0.01);
    const hasCorrectEvent = eventValues.some((event) => typeof event.value === "number" && Math.abs(event.value - expected) < 0.01);
    rows.push({
      donationId: donation.id,
      paidAt: donation.paidAt?.toISOString() ?? null,
      currency: donation.currency,
      baseAmount: donation.amount,
      teamSupport: donation.teamSupport,
      fees: donation.fees,
      totalAmount: donation.totalAmount,
      expectedConversionValue: expected,
      missingFromBase: delta,
      conversionEventsSentAt: donation.conversionEventsSentAt?.toISOString() ?? null,
      eventValues,
      verdict: delta <= 0.01 ? "NO_EXTRA_SUPPORT" : hasCorrectEvent ? "OK_HAS_TOTAL_VALUE" : hasUndercountedEvent ? "UNDERCOUNTED_OLD_EVENT" : "NEEDS_RECHECK",
    });
  }

  return NextResponse.json({
    ok: true,
    days,
    total: rows.length,
    undercounted: rows.filter((row) => row.verdict === "UNDERCOUNTED_OLD_EVENT").length,
    needsRecheck: rows.filter((row) => row.verdict === "NEEDS_RECHECK").length,
    withExtraSupport: rows.filter((row) => row.missingFromBase > 0.01).length,
    rows,
  }, { headers: { "Cache-Control": "no-store" } });
}
