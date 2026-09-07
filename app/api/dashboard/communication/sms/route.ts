import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  getActiveNetgsmRuntimeConfig,
  getActiveBrevoSmsRuntimeConfig,
  type ActiveRuntimeConfig,
} from "@/lib/communication/runtime-config";
import { RETRYABLE_STATUSES } from "@/lib/communication/communication-runtime-types";
import { summarizeSmsSegments } from "@/lib/communication/sms-segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the الرسائل النصية page renders, in one round trip.
 *
 * SMS differs from the other two channels in three ways that shape this payload:
 *
 *  1. **The ladder ends at delivery.** There is no open, no read receipt, no reply — a carrier DLR
 *     saying "handset received it" is the last thing that can ever be known. So there is no
 *     engagement funnel to report, and pretending otherwise would invent a metric.
 *  2. **Volume is not the cost.** SMS bills per 140-byte segment, and Arabic forces UCS-2 at 70
 *     characters per segment instead of 160. A message count therefore under-states the bill by
 *     2–3× on this platform, so segments are returned as a first-class figure.
 *  3. **The provider is chosen per recipient, not per account.** Turkish numbers route to Netgsm,
 *     everything else to Brevo. Either can be unconfigured independently, which means SMS can be
 *     half-working — able to reach Turkey but not abroad — and a single "configured" flag would
 *     hide exactly that.
 */

const CHANNEL = "SMS";
const FAILED_STATUSES = ["FAILED", "BOUNCED"] as const;

type Bucket = { date: string; sent: number; delivered: number; failed: number };

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "messages");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();
    const days = Math.min(365, Math.max(1, parseInt(sp.get("days") || "30")));
    const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(to.getTime() - days * 86_400_000);

    const status = sp.get("status") || "all";
    const search = sp.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "25")));

    // A campaign deep-link scopes the entire page — summary, chart and list — to that campaign,
    // and drops the date window while doing it. The campaign IS the range; keeping the default
    // 30 days would report zeros for any campaign sent earlier than that.
    const campaignId = sp.get("campaign")?.trim() || "";
    const rangeWhere: Prisma.CommunicationDeliveryWhereInput = campaignId
      ? { channel: CHANNEL, campaignId }
      : { channel: CHANNEL, createdAt: { gte: from, lte: to } };

    const listWhere: Prisma.CommunicationDeliveryWhereInput = { ...rangeWhere };
    if (status !== "all") {
      if (status === "failed") listWhere.status = { in: [...FAILED_STATUSES] };
      else if (status === "delivered") listWhere.deliveredAt = { not: null };
      else listWhere.status = status;
    }
    if (search) {
      listWhere.OR = [
        { recipientPhone: { contains: search, mode: "insensitive" } },
        { recipientName: { contains: search, mode: "insensitive" } },
        { templateName: { contains: search, mode: "insensitive" } },
        { renderedBody: { contains: search, mode: "insensitive" } },
      ];
    }

    const [
      total, byStatus, byProvider, deliveredCount, failedCount, allTimeTotal,
      rows, listTotal, bucketRows, netgsm, brevoSms, retryableCount,
    ] = await Promise.all([
      prisma.communicationDelivery.count({ where: rangeWhere }),
      prisma.communicationDelivery.groupBy({ by: ["status"], where: rangeWhere, _count: { _all: true } }),
      // Which carrier actually carried the traffic — the visible half of destination-based routing.
      prisma.communicationDelivery.groupBy({ by: ["provider"], where: rangeWhere, _count: { _all: true } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, deliveredAt: { not: null } } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, status: { in: [...FAILED_STATUSES] } } }),
      prisma.communicationDelivery.count({ where: { channel: CHANNEL } }),
      prisma.communicationDelivery.findMany({
        where: listWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, status: true, origin: true, provider: true, templateName: true, renderedBody: true,
          recipientPhone: true, recipientName: true, recipientUserId: true, errorMessage: true,
          providerMessageId: true, createdAt: true, sentAt: true, deliveredAt: true,
          failedAt: true, retriedAt: true,
        },
      }),
      prisma.communicationDelivery.count({ where: listWhere }),
      // `renderedBody` rides along on the scan the chart already needs, so segment totals cost no
      // extra query. SMS bodies are a few hundred characters at most.
      prisma.communicationDelivery.findMany({
        where: rangeWhere,
        select: { createdAt: true, status: true, deliveredAt: true, renderedBody: true },
        orderBy: { createdAt: "asc" },
      }),
      getActiveNetgsmRuntimeConfig(),
      getActiveBrevoSmsRuntimeConfig(),
      prisma.communicationDelivery.count({
        where: {
          ...rangeWhere,
          status: { in: [...RETRYABLE_STATUSES] },
          // See the email route: on MongoDB `null` misses documents written before the field existed.
          OR: [{ retriedAt: null }, { retriedAt: { isSet: false } }],
        },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    const sentCount =
      (statusCounts.SENT ?? 0) + (statusCounts.SENT_TO_PROVIDER ?? 0) + (statusCounts.DELIVERED ?? 0) + failedCount;
    const attempted = Math.max(sentCount, 0);
    const rate = (part: number) => (attempted > 0 ? Math.round((part / attempted) * 1000) / 10 : 0);

    const buckets = new Map<string, Bucket>();
    for (const row of bucketRows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key) ?? { date: key, sent: 0, delivered: 0, failed: 0 };
      if ((FAILED_STATUSES as readonly string[]).includes(row.status)) bucket.failed++;
      else if (!["SKIPPED", "RENDERED", "DRAFT"].includes(row.status)) bucket.sent++;
      if (row.deliveredAt) bucket.delivered++;
      buckets.set(key, bucket);
    }

    // Only messages that were actually handed over cost money — a SKIPPED row was never billed.
    const segments = summarizeSmsSegments(
      bucketRows
        .filter((row) => !["SKIPPED", "RENDERED", "DRAFT"].includes(row.status))
        .map((row) => row.renderedBody),
    );

    const providerVolume = byProvider
      .map((row) => ({ provider: row.provider ?? "—", count: row._count._all }))
      .sort((a, b) => b.count - a.count);

    // Generic over the values type: both routes report readiness the same way, and only the
    // three fields below are ever surfaced.
    const describe = <T,>(config: ActiveRuntimeConfig<T>) => ({
      configured: config.configured,
      reason: config.configured ? null : config.reason,
      missingFields: config.configured ? [] : config.missingFields,
    });

    return NextResponse.json({
      ok: true,
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        total, allTimeTotal, attempted,
        delivered: deliveredCount,
        failed: failedCount,
        skipped: statusCounts.SKIPPED ?? 0,
        deliveredRate: rate(deliveredCount),
        failedRate: rate(failedCount),
      },
      /** Carrier delivery receipts. Until one arrives, "وصلت" is unknown rather than zero. */
      trackingLive: deliveredCount > 0 || (statusCounts.DELIVERED ?? 0) > 0,
      retryableCount,
      /**
       * Both routes, separately. `anyConfigured` is what decides whether SMS can send at all;
       * the per-route flags are what say *where* it can send.
       */
      routing: {
        netgsm: describe(netgsm),
        brevoSms: describe(brevoSms),
        anyConfigured: netgsm.configured || brevoSms.configured,
        providerVolume,
      },
      segments,
      /**
       * `enum MessageChannel` in Prisma is EMAIL | WHATSAPP — no trigger can emit SMS, so an
       * empty channel here is an architectural fact, not a delivery problem. The page says so
       * rather than leaving an operator to hunt for a broken integration.
       */
      triggersSupported: false,
      statusCounts,
      timeseries: [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)),
      rows,
      pagination: { page, limit, total: listTotal, pages: Math.max(1, Math.ceil(listTotal / limit)) },
    });
  } catch (error) {
    console.error("communication/sms GET failed", error);
    return NextResponse.json({ ok: false, error: "تعذّر تحميل بيانات الرسائل النصية" }, { status: 500 });
  }
}
