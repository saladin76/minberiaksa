import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { getOpenAiProviderStatus } from "@/lib/ai/core/openai-provider";
import { loadConciergeSettings, saveConciergeSettings } from "@/lib/ai/concierge/settings";
import { DEFAULT_CONCIERGE_SETTINGS } from "@/lib/ai/concierge/settings-shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai/concierge/settings  the concierge's switches, the
 *     defaults, the model provider's state and how much is stored.
 * PUT  replace the settings (sanitized; missing fields fall back to defaults).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;

  try {
    const [settings, conversations, insights, oldest] = await Promise.all([
      loadConciergeSettings(),
      prisma.aiConciergeConversation.count(),
      prisma.aiConciergeInsight.count(),
      prisma.aiConciergeConversation.findFirst({ orderBy: { startedAt: "asc" }, select: { startedAt: true } }),
    ]);
    const provider = getOpenAiProviderStatus();
    return NextResponse.json(
      {
        settings,
        defaults: DEFAULT_CONCIERGE_SETTINGS,
        provider: { ready: provider.mode === "ready", configured: provider.configured, externalCallsEnabled: provider.externalCallsEnabled, model: provider.model, reason: provider.reason },
        storage: { conversations, insights, oldestConversation: oldest?.startedAt ?? null },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/admin/ai/concierge/settings:", error);
    return NextResponse.json({ error: "تعذّر تحميل الإعدادات" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  try {
    const before = await loadConciergeSettings();
    const { id, settings, updatedAt } = await saveConciergeSettings(body.settings ?? body);
    const changed = (Object.keys(settings) as Array<keyof typeof settings>).filter((k) => settings[k] !== before[k]);
    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "AI_CONCIERGE_SETTINGS_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل إعدادات مساعد العطاء${changed.length ? ` (${changed.join("، ")})` : ""}`,
      entityType: "GlobalSettings",
      entityId: id,
      metadata: { changed },
    });
    return NextResponse.json({ settings, updatedAt });
  } catch (error) {
    console.error("PUT /api/admin/ai/concierge/settings:", error);
    return NextResponse.json({ error: "تعذّر حفظ الإعدادات" }, { status: 500 });
  }
}
