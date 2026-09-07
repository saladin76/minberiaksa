import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // Messages permission covers both inbound and outbound on the unified page.
    const denied = requireAdminOrDashboardPermission(session, "messages");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const channel = sp.get("channel"); // EMAIL | WHATSAPP | all
    const status = sp.get("status"); // SENT | FAILED | SKIPPED | all
    const origin = sp.get("origin"); // MANUAL | TRIGGER | BACKFILL | all
    const triggerEvent = sp.get("triggerEvent"); // enum | all
    const templateId = sp.get("templateId"); // ObjectId | all
    const search = sp.get("search")?.trim() || undefined;
    const dateFrom = sp.get("dateFrom"); // ISO date
    const dateTo = sp.get("dateTo"); // ISO date

    const where: Prisma.SentMessageWhereInput = {};
    if (channel && channel !== "all") where.channel = channel as Prisma.SentMessageWhereInput["channel"];
    if (status && status !== "all") where.status = status as Prisma.SentMessageWhereInput["status"];
    if (origin && origin !== "all") where.origin = origin as Prisma.SentMessageWhereInput["origin"];
    if (triggerEvent && triggerEvent !== "all") {
      where.triggerEvent = triggerEvent as Prisma.SentMessageWhereInput["triggerEvent"];
    }
    if (templateId && templateId !== "all") where.templateId = templateId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom + "T00:00:00.000Z");
      if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59.999Z");
    }
    if (search) {
      where.OR = [
        { templateName: { contains: search, mode: "insensitive" } },
        { recipientName: { contains: search, mode: "insensitive" } },
        { recipientEmail: { contains: search, mode: "insensitive" } },
        { recipientPhone: { contains: search } },
        { renderedSubject: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, items, channelStats] = await Promise.all([
      prisma.sentMessage.count({ where }),
      prisma.sentMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        // Skip the heavy renderedBody/variables fields — the row preview
        // dialog fetches them lazily via the by-id endpoint.
        select: {
          id: true,
          channel: true,
          origin: true,
          status: true,
          templateId: true,
          templateName: true,
          triggerEvent: true,
          locale: true,
          recipientUserId: true,
          recipientEmail: true,
          recipientPhone: true,
          recipientName: true,
          renderedSubject: true,
          errorMessage: true,
          actorId: true,
          actorName: true,
          donationId: true,
          backfillTotal: true,
          backfillSent: true,
          backfillFailed: true,
          backfillSkipped: true,
          createdAt: true,
        },
      }),
      prisma.sentMessage.groupBy({
        by: ["channel", "status"],
        where,
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + items.length < total,
      },
      stats: channelStats.map((s) => ({
        channel: s.channel,
        status: s.status,
        count: s._count._all,
      })),
    });
  } catch (err) {
    console.error("sent-messages list failed:", err);
    return NextResponse.json({ error: "Failed to load sent messages" }, { status: 500 });
  }
}
