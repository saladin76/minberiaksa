import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { getOpenAiProviderStatus } from "@/lib/ai/core/openai-provider";
import { parseConciergeRange } from "@/lib/ai/concierge/analytics";
import { loadConciergeSettings } from "@/lib/ai/concierge/settings";
import { sanitizeConversationFilters } from "@/lib/ai/concierge/conversations";
import { runConciergeInsight } from "@/lib/ai/concierge/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Reading a few hundred conversations takes the model a while. */
export const maxDuration = 120;

/**
 * GET  /api/admin/ai/concierge/insights  past AI readings (newest first) and
 *      whether the model is available.
 * POST /api/admin/ai/concierge/insights  run a new reading:
 *      { days? | from?, to?, filters? } → the saved insight.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;

  try {
    const items = await prisma.aiConciergeInsight.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, createdAt: true, createdByName: true, from: true, to: true, filters: true, conversationCount: true, messageCount: true, mode: true, model: true },
    });
    const provider = getOpenAiProviderStatus();
    return NextResponse.json(
      { items, provider: { ready: provider.mode === "ready", model: provider.model, reason: provider.reason } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/admin/ai/concierge/insights:", error);
    return NextResponse.json({ error: "تعذّر تحميل الاستنتاجات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  try {
    const params = new URLSearchParams();
    if (typeof body.from === "string") params.set("from", body.from);
    if (typeof body.to === "string") params.set("to", body.to);
    if (typeof body.days === "number") params.set("days", String(body.days));
    const range = parseConciergeRange(params);
    const filters = sanitizeConversationFilters(body.filters);
    const settings = await loadConciergeSettings();

    const actor = auditActorFromDashboardSession(session!);
    const { insight, error, read, total } = await runConciergeInsight({
      range,
      filters,
      windowDays: settings.attributionWindowDays,
      createdBy: { id: actor.actorId ?? null, name: actor.actorName ?? null },
    });
    queueAuditLog({
      ...actor,
      action: "AI_CONCIERGE_INSIGHT_RUN",
      messageAr: `${actor.actorName ?? "مسؤول"} شغّل تحليل الذكاء الاصطناعي لمحادثات مساعد العطاء (${total} محادثة)`,
      entityType: "AiConciergeInsight",
      entityId: insight.id,
    });
    return NextResponse.json({ insight, warning: error, read, total });
  } catch (error) {
    console.error("POST /api/admin/ai/concierge/insights:", error);
    return NextResponse.json({ error: "تعذّر تشغيل التحليل" }, { status: 500 });
  }
}
