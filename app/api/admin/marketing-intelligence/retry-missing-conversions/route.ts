import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { syncDonationConversion } from "@/lib/tracking/donation-conversion-server";

export const dynamic = "force-dynamic";

type AttributionSignals = {
  fbclid: boolean;
  fbc: boolean;
  fbp: boolean;
  utm: boolean;
  campaign: boolean;
  ad: boolean;
  adset: boolean;
  quality: "strong" | "medium" | "weak";
  warnings: string[];
};

type LedgerState = {
  hasLedger: boolean;
  hasSent: boolean;
  statuses: string[];
};

function legacyOid(id: string) {
  return /^[a-f0-9]{24}$/i.test(id) ? { $oid: id } : id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(row: Record<string, unknown> | null, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function has(row: Record<string, unknown> | null, key: string): boolean {
  return Boolean(str(row, key));
}

function paidDonationValue(row: { amount: number; teamSupport: number; fees: number; totalAmount: number }) {
  const total = Number(row.totalAmount ?? 0);
  if (Number.isFinite(total) && total > 0) return total;
  const fallback = Number(row.amount || 0) + Number(row.teamSupport || 0) + Number(row.fees || 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

function attributionSignals(raw: unknown): AttributionSignals {
  const a = isRecord(raw) ? raw : null;
  const fbclid = has(a, "fbclid");
  const fbc = has(a, "fbc");
  const fbp = has(a, "fbp");
  const utm = has(a, "utm_campaign") || has(a, "utm_source") || has(a, "utm_medium");
  const campaign = has(a, "campaign_id") || has(a, "utm_id") || has(a, "campaign_name");
  const ad = has(a, "ad_id") || has(a, "ad_name") || has(a, "creative_id");
  const adset = has(a, "adset_id") || has(a, "adset_name") || has(a, "ad_group_id");
  const warnings = (str(a, "tracking_quality_warnings") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  let score = 0;
  if (fbclid) score += 4;
  if (fbc) score += 4;
  if (fbp) score += 2;
  if (utm) score += 1;
  if (campaign) score += 2;
  if (ad) score += 2;
  if (adset) score += 1;
  const quality = score >= 6 ? "strong" : score >= 3 ? "medium" : "weak";
  return { fbclid, fbc, fbp, utm, campaign, ad, adset, quality, warnings };
}

async function metaServerLedgerState(donationId: string): Promise<LedgerState> {
  try {
    const result = await prisma.$runCommandRaw({
      find: "ConversionEvent",
      filter: {
        platform: "META",
        channel: "server",
        eventName: "Donate",
        $or: [
          { donationId },
          { donationId: legacyOid(donationId) },
          { eventId: `donate_${donationId}` },
        ],
      },
      projection: { status: 1 },
      limit: 20,
    });
    const batch = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch)
      ? result.cursor.firstBatch
      : [];
    const statuses = batch
      .map((item) => (isRecord(item) && typeof item.status === "string" ? item.status : "UNKNOWN"))
      .filter(Boolean);
    return { hasLedger: statuses.length > 0, hasSent: statuses.includes("SENT"), statuses };
  } catch {
    return { hasLedger: false, hasSent: false, statuses: [] };
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body?.limit ?? 25) || 25, 100));
  const days = Math.max(1, Math.min(Number(body?.days ?? 7) || 7, 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const recentPaid = await prisma.donation.findMany({
    where: { status: "PAID", paidAt: { not: null, gte: since } },
    orderBy: { paidAt: "desc" },
    take: Math.max(limit * 3, limit),
    select: { id: true, paidAt: true, amount: true, teamSupport: true, fees: true, totalAmount: true, currency: true, conversionEventsSentAt: true, attribution: true },
  });

  const rows: Array<typeof recentPaid[number] & { ledger: LedgerState }> = [];
  for (const row of recentPaid) {
    const ledger = await metaServerLedgerState(row.id);
    if (!ledger.hasSent) rows.push({ ...row, ledger });
    if (rows.length >= limit) break;
  }

  const results = [];
  for (const row of rows) {
    if (row.conversionEventsSentAt != null) {
      await prisma.donation.update({ where: { id: row.id }, data: { conversionEventsSentAt: null } });
    }
    const result = await syncDonationConversion(row.id);
    results.push({
      donationId: row.id,
      paidAt: row.paidAt?.toISOString() ?? null,
      amount: paidDonationValue(row),
      originalAmount: row.amount,
      teamSupport: row.teamSupport,
      fees: row.fees,
      totalAmount: row.totalAmount,
      currency: row.currency,
      wasAlreadyMarkedSent: row.conversionEventsSentAt != null,
      previousLedger: row.ledger,
      attribution: attributionSignals(row.attribution),
      result,
    });
  }

  return NextResponse.json({ ok: true, scanned: rows.length, considered: recentPaid.length, limit, days, results });
}
