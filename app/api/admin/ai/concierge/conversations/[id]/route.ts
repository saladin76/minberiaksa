import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { findAttributedDonations } from "@/lib/ai/concierge/analytics";
import { loadConciergeSettings } from "@/lib/ai/concierge/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * GET /api/admin/ai/concierge/conversations/:id — one conversation in full:
 *     the transcript, the funnel steps of its session, the campaigns it showed,
 *     the donor (when signed in) and the donations credited to it.
 * DELETE — remove the transcript (a visitor's request, a test chat). The
 *     funnel events stay: they carry no text.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;

  const { id } = await params;
  if (!OBJECT_ID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const conv = await prisma.aiConciergeConversation.findUnique({ where: { id } });
    if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const settings = await loadConciergeSettings();
    const windowMs = settings.attributionWindowDays * 24 * 60 * 60 * 1000;
    const [events, user, donations] = await Promise.all([
      prisma.aiConciergeEvent.findMany({
        where: { sessionId: conv.sessionId },
        orderBy: { createdAt: "asc" },
        take: 300,
        select: { event: true, createdAt: true, campaignId: true, amountUSD: true, frequency: true, intent: true, mode: true, route: true },
      }),
      conv.userId ? prisma.user.findUnique({ where: { id: conv.userId }, select: { id: true, name: true, email: true, phone: true, countryCode: true } }) : null,
      findAttributedDonations({
        from: new Date(conv.startedAt.getTime() - 60_000),
        to: new Date(Math.min(Date.now(), conv.lastMessageAt.getTime() + windowMs)),
        windowDays: settings.attributionWindowDays,
        sessionId: conv.sessionId,
        conversation: { userId: conv.userId, startedAt: conv.startedAt, lastMessageAt: conv.lastMessageAt },
      }),
    ]);

    const campaignIds = [...new Set([...conv.campaignIds, ...conv.turns.flatMap((t) => t.campaignIds), ...events.map((e) => e.campaignId).filter((v): v is string => Boolean(v))])].filter((c) => OBJECT_ID.test(c));
    const campaigns = campaignIds.length ? await prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, title: true, slug: true } }) : [];

    return NextResponse.json(
      {
        conversation: conv,
        user,
        events,
        campaigns,
        donations: donations.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
        windowDays: settings.attributionWindowDays,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/admin/ai/concierge/conversations/[id]:", error);
    return NextResponse.json({ error: "تعذّر تحميل المحادثة" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;

  const { id } = await params;
  if (!OBJECT_ID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const conv = await prisma.aiConciergeConversation.delete({ where: { id }, select: { id: true, sessionId: true } }).catch(() => null);
    if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "AI_CONCIERGE_CONVERSATION_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف محادثة من محادثات مساعد العطاء`,
      entityType: "AiConciergeConversation",
      entityId: conv.id,
      metadata: { sessionId: conv.sessionId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/ai/concierge/conversations/[id]:", error);
    return NextResponse.json({ error: "تعذّر حذف المحادثة" }, { status: 500 });
  }
}
