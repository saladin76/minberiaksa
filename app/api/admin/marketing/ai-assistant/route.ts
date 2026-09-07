import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AI_NAME = "AI Assistant";

const schema = z.object({
  provider: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(160),
  keyValue: z.string().optional(),
  baseUrl: z.string().trim().max(500).optional().nullable(),
  assistantId: z.string().trim().max(200).optional().nullable(),
  dailyBudgetLimit: z.string().trim().max(80).optional().nullable(),
  enabled: z.boolean().optional(),
});

function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const row = await prisma.marketingPlatformConnection.findFirst({
    where: { platform: "CUSTOM", category: "CUSTOM", name: AI_NAME },
    orderBy: { updatedAt: "desc" },
  });

  return jsonNoStore({
    ok: true,
    settings: row ? {
      id: row.id,
      provider: row.accountName ?? "",
      model: row.accountId ?? "",
      keyPreview: maskSecret(row.accessToken),
      hasKey: Boolean(row.accessToken),
      baseUrl: row.businessId ?? "",
      assistantId: row.managerAccountId ?? "",
      dailyBudgetLimit: row.defaultCurrency ?? "",
      enabled: row.enabled,
      status: row.status,
      updatedAt: row.updatedAt,
    } : null,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const actor = auditActorFromDashboardSession(session!);
  const existing = await prisma.marketingPlatformConnection.findFirst({
    where: { platform: "CUSTOM", category: "CUSTOM", name: AI_NAME },
    orderBy: { updatedAt: "desc" },
  });

  const data = {
    category: "CUSTOM",
    platform: "CUSTOM",
    name: AI_NAME,
    accountName: d.provider,
    accountId: d.model,
    businessId: d.baseUrl || null,
    managerAccountId: d.assistantId || null,
    defaultCurrency: d.dailyBudgetLimit || null,
    accessToken: d.keyValue && d.keyValue.trim().length > 0 ? d.keyValue.trim() : existing?.accessToken ?? null,
    status: d.provider && d.model && (d.keyValue || existing?.accessToken) ? "ACTIVE" : "MISSING_CONFIG",
    enabled: d.enabled ?? true,
    supportedLocales: [],
    supportedCountries: [],
    notes: "AI Assistant API settings used by Marketing Operating System.",
    updatedBy: actor.actorId,
  };

  const saved = existing
    ? await prisma.marketingPlatformConnection.update({ where: { id: existing.id }, data })
    : await prisma.marketingPlatformConnection.create({ data });

  await writeAuditLog({
    ...actor,
    action: "AI_ASSISTANT_SETTINGS_SAVED",
    messageAr: "تم حفظ إعدادات AI Assistant",
    entityType: "MarketingPlatformConnection",
    entityId: saved.id,
    metadata: { provider: saved.accountName, model: saved.accountId, status: saved.status, hasKey: Boolean(saved.accessToken) },
    stream: "TEAM",
  });

  return jsonNoStore({ ok: true, settings: { id: saved.id, provider: saved.accountName, model: saved.accountId, keyPreview: maskSecret(saved.accessToken), hasKey: Boolean(saved.accessToken), baseUrl: saved.businessId, assistantId: saved.managerAccountId, dailyBudgetLimit: saved.defaultCurrency, enabled: saved.enabled, status: saved.status } });
}
