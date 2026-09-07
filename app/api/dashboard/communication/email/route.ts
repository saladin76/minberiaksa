import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { RETRYABLE_STATUSES } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the البريد الإلكتروني page renders, in one round trip.
 *
 * Source of truth is `CommunicationDelivery`, not `SentMessage`: only the former carries the
 * engagement timestamps (deliveredAt / openedAt / clickedAt) that make "was it seen?" answerable.
 * `SentMessage` holds a longer history but is a flat mirror with no engagement columns, so a page
 * built on it could never show more than "we handed it to the provider".
 *
 * Engagement figures are reported alongside `trackingLive`, which is false until at least one
 * provider event has ever been stored. Without that flag a brand-new integration and a genuinely
 * unopened campaign both render as "0% opened", and those mean opposite things.
 */

const CHANNEL = "EMAIL";

/** Terminal states — a delivery here will never progress further. */
const FAILED_STATUSES = ["FAILED", "BOUNCED"] as const;

type Bucket = { date: string; sent: number; delivered: number; opened: number; failed: number };

function parseRange(sp: URLSearchParams): { from: Date; to: Date; days: number } {
  const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();
  const days = Math.min(365, Math.max(1, parseInt(sp.get("days") || "30")));
  const from = sp.get("from")
    ? new Date(sp.get("from")!)
    : new Date(to.getTime() - days * 86_400_000);
  return { from, to, days };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // Same permission as the message log — this is the same data, presented per channel.
    const denied = requireAdminOrDashboardPermission(session, "messages");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const { from, to } = parseRange(sp);
    const status = sp.get("status") || "all";
    const origin = sp.get("origin") || "all";
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
      else if (status === "opened") listWhere.openedAt = { not: null };
      else if (status === "clicked") listWhere.clickedAt = { not: null };
      else listWhere.status = status;
    }
    if (origin !== "all") listWhere.origin = origin;
    if (search) {
      listWhere.OR = [
        { recipientEmail: { contains: search, mode: "insensitive" } },
        { recipientName: { contains: search, mode: "insensitive" } },
        { renderedSubject: { contains: search, mode: "insensitive" } },
        { templateName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [
      total,
      byStatus,
      deliveredCount,
      openedCount,
      clickedCount,
      failedCount,
      providerEventCount,
      allTimeTotal,
      rows,
      listTotal,
      byTemplate,
      retryableCount,
    ] = await Promise.all([
      prisma.communicationDelivery.count({ where: rangeWhere }),
      prisma.communicationDelivery.groupBy({ by: ["status"], where: rangeWhere, _count: { _all: true } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, deliveredAt: { not: null } } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, openedAt: { not: null } } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, clickedAt: { not: null } } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, status: { in: [...FAILED_STATUSES] } } }),
      // Zero means no webhook event has EVER been stored — engagement metrics are blind, not zero.
      prisma.communicationProviderEvent.count(),
      prisma.communicationDelivery.count({ where: { channel: CHANNEL } }),
      prisma.communicationDelivery.findMany({
        where: listWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, status: true, origin: true, templateName: true, renderedSubject: true,
          recipientEmail: true, recipientName: true, recipientUserId: true, errorMessage: true,
          providerMessageId: true, createdAt: true, sentAt: true, deliveredAt: true,
          openedAt: true, clickedAt: true, failedAt: true, retriedAt: true,
        },
      }),
      prisma.communicationDelivery.count({ where: listWhere }),
      // No `orderBy: { _count: … }` here: on MongoDB it comes back in the wrong order (verified —
      // it returned ascending), which combined with `take` would silently return the *least* used
      // templates. Sorted in JS below instead; the distinct-template count is tiny.
      prisma.communicationDelivery.groupBy({ by: ["templateName"], where: rangeWhere, _count: { _all: true } }),
      // Re-sendable backlog. BOUNCED is excluded (a bounce is not fixed by sending again), and rows
      // already retried are excluded — on MongoDB `null` matches only an explicit null, so documents
      // written before the field existed need the `isSet: false` arm or none of them would count.
      prisma.communicationDelivery.count({
        where: {
          ...rangeWhere,
          status: { in: [...RETRYABLE_STATUSES] },
          OR: [{ retriedAt: null }, { retriedAt: { isSet: false } }],
        },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    // "Accepted by the provider" — the denominator every engagement rate is measured against.
    // Counting against `total` would let SKIPPED rows (no email address, unsubscribed) drag the
    // open rate down for messages that were never sent to anyone.
    const sentCount =
      (statusCounts.SENT ?? 0) + (statusCounts.SENT_TO_PROVIDER ?? 0) + (statusCounts.DELIVERED ?? 0) +
      (statusCounts.OPENED ?? 0) + (statusCounts.CLICKED ?? 0) + failedCount;
    const attempted = Math.max(sentCount, 0);

    // Daily buckets for the trend chart, built in JS: MongoDB has no date_trunc through Prisma
    // and the row counts here are small enough that one scan beats N queries.
    const bucketRows = await prisma.communicationDelivery.findMany({
      where: rangeWhere,
      select: { createdAt: true, status: true, deliveredAt: true, openedAt: true },
      orderBy: { createdAt: "asc" },
    });
    const buckets = new Map<string, Bucket>();
    for (const row of bucketRows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key) ?? { date: key, sent: 0, delivered: 0, opened: 0, failed: 0 };
      if ((FAILED_STATUSES as readonly string[]).includes(row.status)) bucket.failed++;
      else if (row.status !== "SKIPPED" && row.status !== "RENDERED" && row.status !== "DRAFT") bucket.sent++;
      if (row.deliveredAt) bucket.delivered++;
      if (row.openedAt) bucket.opened++;
      buckets.set(key, bucket);
    }

    const rate = (part: number) => (attempted > 0 ? Math.round((part / attempted) * 1000) / 10 : 0);

    return NextResponse.json({
      ok: true,
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        total,
        allTimeTotal,
        attempted,
        delivered: deliveredCount,
        opened: openedCount,
        clicked: clickedCount,
        failed: failedCount,
        skipped: statusCounts.SKIPPED ?? 0,
        deliveredRate: rate(deliveredCount),
        openRate: rate(openedCount),
        clickRate: rate(clickedCount),
        failedRate: rate(failedCount),
      },
      /**
       * False until the provider has ever posted an event. The page uses this to say "tracking
       * not receiving events" instead of presenting an authoritative-looking 0% open rate.
       */
      trackingLive: providerEventCount > 0,
      retryableCount,
      statusCounts,
      timeseries: [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)),
      topTemplates: byTemplate
        .map((t) => ({ name: t.templateName || "—", count: t._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      rows,
      pagination: { page, limit, total: listTotal, pages: Math.max(1, Math.ceil(listTotal / limit)) },
    });
  } catch (error) {
    console.error("communication/email GET failed", error);
    return NextResponse.json({ ok: false, error: "تعذّر تحميل بيانات البريد" }, { status: 500 });
  }
}
