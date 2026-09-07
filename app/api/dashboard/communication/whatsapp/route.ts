import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { getActiveMetaWhatsappRuntimeConfig } from "@/lib/communication/runtime-config";
import { RETRYABLE_STATUSES } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the واتساب page renders, in one round trip.
 *
 * WhatsApp differs from email in the two ways that matter here:
 *
 *  1. The engagement ladder ends in READ (the blue ticks) and REPLIED, not opened/clicked. A read
 *     receipt is a genuine provider-confirmed event, so it is trustworthy in a way an email open
 *     pixel is not — but it is also suppressible by the recipient, so absence still is not proof.
 *  2. Business-initiated sends require a Meta-APPROVED template. A perfectly configured account
 *     with no approved template can send exactly nothing, and that is the single most common
 *     reason this channel sits at zero. Reporting "0 sent" without reporting *why* would make the
 *     page look like a quiet channel rather than a blocked one, so template readiness and
 *     provider configuration are returned as first-class fields, not left for the reader to infer.
 */

const CHANNEL = "WHATSAPP";
const FAILED_STATUSES = ["FAILED", "BOUNCED"] as const;

type Bucket = { date: string; sent: number; delivered: number; read: number; failed: number };

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
      else if (status === "read") listWhere.readAt = { not: null };
      else if (status === "replied") listWhere.repliedAt = { not: null };
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
      total, byStatus, deliveredCount, readCount, repliedCount, failedCount,
      allTimeTotal, rows, listTotal, bucketRows, templates, metaConfig, retryableCount,
    ] = await Promise.all([
      prisma.communicationDelivery.count({ where: rangeWhere }),
      prisma.communicationDelivery.groupBy({ by: ["status"], where: rangeWhere, _count: { _all: true } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, deliveredAt: { not: null } } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, readAt: { not: null } } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, repliedAt: { not: null } } }),
      prisma.communicationDelivery.count({ where: { ...rangeWhere, status: { in: [...FAILED_STATUSES] } } }),
      prisma.communicationDelivery.count({ where: { channel: CHANNEL } }),
      prisma.communicationDelivery.findMany({
        where: listWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, status: true, origin: true, templateName: true, renderedBody: true,
          recipientPhone: true, recipientName: true, recipientUserId: true, errorMessage: true,
          providerMessageId: true, providerConversationId: true, createdAt: true, sentAt: true,
          deliveredAt: true, readAt: true, repliedAt: true, failedAt: true, retriedAt: true,
        },
      }),
      prisma.communicationDelivery.count({ where: listWhere }),
      prisma.communicationDelivery.findMany({
        where: rangeWhere,
        select: { createdAt: true, status: true, deliveredAt: true, readAt: true },
        orderBy: { createdAt: "asc" },
      }),
      // Template readiness is the usual reason this channel is silent — see the note above.
      prisma.whatsappTemplate.findMany({
        select: { id: true, name: true, approvalStatus: true, category: true, language: true, externalTemplateId: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      getActiveMetaWhatsappRuntimeConfig(),
      // Re-sendable backlog — see the identical note on the email route for the `isSet` arm.
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

    const sentCount =
      (statusCounts.SENT ?? 0) + (statusCounts.SENT_TO_PROVIDER ?? 0) + (statusCounts.DELIVERED ?? 0) +
      (statusCounts.READ ?? 0) + (statusCounts.REPLIED ?? 0) + failedCount;
    const attempted = Math.max(sentCount, 0);
    const rate = (part: number) => (attempted > 0 ? Math.round((part / attempted) * 1000) / 10 : 0);

    const buckets = new Map<string, Bucket>();
    for (const row of bucketRows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key) ?? { date: key, sent: 0, delivered: 0, read: 0, failed: 0 };
      if ((FAILED_STATUSES as readonly string[]).includes(row.status)) bucket.failed++;
      else if (!["SKIPPED", "RENDERED", "DRAFT"].includes(row.status)) bucket.sent++;
      if (row.deliveredAt) bucket.delivered++;
      if (row.readAt) bucket.read++;
      buckets.set(key, bucket);
    }

    // A template can only carry a business-initiated send once Meta has approved it AND we hold
    // its external id. Anything else is a draft as far as sending is concerned, however complete
    // it looks in our own editor.
    const templateRows = templates.map((t) => {
      const approval = (t.approvalStatus ?? "").toUpperCase();
      const registered = Boolean(t.externalTemplateId);
      const ready = registered && approval === "APPROVED";
      return {
        id: t.id,
        name: t.name,
        approvalStatus: t.approvalStatus,
        category: t.category,
        language: t.language,
        registered,
        ready,
        state: ready ? "READY" : registered ? (approval || "PENDING") : "NOT_REGISTERED",
        updatedAt: t.updatedAt.toISOString(),
      };
    });
    const readyTemplates = templateRows.filter((t) => t.ready).length;

    // Read receipts arriving at all is what makes an empty "read" column meaningful.
    const trackingLive = deliveredCount > 0 || readCount > 0 || (statusCounts.DELIVERED ?? 0) > 0 || (statusCounts.READ ?? 0) > 0;

    return NextResponse.json({
      ok: true,
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        total, allTimeTotal, attempted,
        delivered: deliveredCount, read: readCount, replied: repliedCount,
        failed: failedCount, skipped: statusCounts.SKIPPED ?? 0,
        deliveredRate: rate(deliveredCount), readRate: rate(readCount),
        repliedRate: rate(repliedCount), failedRate: rate(failedCount),
      },
      trackingLive,
      retryableCount,
      provider: {
        configured: metaConfig.configured,
        reason: metaConfig.configured ? null : metaConfig.reason,
        missingFields: metaConfig.configured ? [] : metaConfig.missingFields,
      },
      templates: { total: templateRows.length, ready: readyTemplates, rows: templateRows.slice(0, 8) },
      statusCounts,
      timeseries: [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)),
      rows,
      pagination: { page, limit, total: listTotal, pages: Math.max(1, Math.ceil(listTotal / limit)) },
    });
  } catch (error) {
    console.error("communication/whatsapp GET failed", error);
    return NextResponse.json({ ok: false, error: "تعذّر تحميل بيانات واتساب" }, { status: 500 });
  }
}
