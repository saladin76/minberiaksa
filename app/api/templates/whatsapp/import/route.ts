import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import {
  syncTwilioWhatsappTemplates,
  type NormalizedTemplate,
  type SyncStatus,
} from "@/lib/messaging/twilio-templates";

interface ImportSummary {
  status: SyncStatus;
  messageAr: string;
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

/**
 * Sync Twilio Content templates into our `WhatsappTemplate` table.
 *
 * Behavior:
 *   - missing_config / not_implemented → 200 with `status` so the dashboard
 *     can show a clear info banner instead of crashing.
 *   - failed → 200 with `status:"failed"` + error message (no credentials).
 *   - ok → upserts by `externalTemplateId`, preserving local notes on the
 *     `body` field unless the Twilio body is non-empty. Audit logs are
 *     written for start, finish, and failure (never includes auth tokens).
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const actor = auditActorFromDashboardSession(session!);

  await writeAuditLog({
    ...actor,
    action: "TWILIO_TEMPLATE_IMPORT_STARTED",
    messageAr: "بدأ استيراد قوالب WhatsApp من Twilio",
    entityType: "WhatsappTemplate",
    stream: "TEAM",
  });

  const result = await syncTwilioWhatsappTemplates();

  if (result.status !== "ok") {
    await writeAuditLog({
      ...actor,
      action: "TWILIO_TEMPLATE_IMPORT_FAILED",
      messageAr: `فشل/تعذّر استيراد قوالب Twilio — ${result.status}`,
      entityType: "WhatsappTemplate",
      metadata: { status: result.status, error: result.error ?? null },
      stream: "TEAM",
    });
    const summary: ImportSummary = {
      status: result.status,
      messageAr: result.messageAr,
      imported: 0,
      updated: 0,
      skipped: 0,
      total: 0,
    };
    return NextResponse.json({ ...summary, error: result.error ?? null });
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  for (const t of result.templates) {
    try {
      const upserted = await upsertTemplate(t, actor.actorId);
      if (upserted === "created") imported += 1;
      else if (upserted === "updated") updated += 1;
      else skipped += 1;
    } catch (e) {
      skipped += 1;
      console.error("Failed to upsert Twilio template", t.externalTemplateId, e);
    }
  }

  await writeAuditLog({
    ...actor,
    action: "TWILIO_TEMPLATE_IMPORT_FINISHED",
    messageAr: `استيراد قوالب Twilio انتهى — ${imported} جديد، ${updated} محدّث`,
    entityType: "WhatsappTemplate",
    metadata: {
      total: result.templates.length,
      imported,
      updated,
      skipped,
    },
    stream: "TEAM",
  });

  const summary: ImportSummary = {
    status: "ok",
    messageAr: `تم استيراد ${imported} وتحديث ${updated} قالب من Twilio.`,
    imported,
    updated,
    skipped,
    total: result.templates.length,
  };
  return NextResponse.json(summary);
}

async function upsertTemplate(
  t: NormalizedTemplate,
  createdById: string | null
): Promise<"created" | "updated" | "skipped"> {
  const existing = await prisma.whatsappTemplate.findFirst({
    where: { externalTemplateId: t.externalTemplateId, provider: "TWILIO" },
    select: { id: true, body: true, name: true },
  });

  const data: Prisma.WhatsappTemplateUncheckedUpdateInput = {
    name: t.name,
    body: t.body && t.body.length > 0 ? t.body : existing?.body ?? "",
    provider: "TWILIO",
    channel: "WHATSAPP",
    externalTemplateId: t.externalTemplateId,
    templateType: t.templateType,
    language: t.language,
    category: t.category,
    approvalStatus: t.approvalStatus,
    header: (t.header as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    footerText: t.footerText,
    buttons: t.buttons as unknown as Prisma.InputJsonValue,
    variables: t.variables as unknown as Prisma.InputJsonValue,
    lastImportedAt: new Date(),
    lastSyncStatus: "ok",
    lastSyncError: null,
    providerRaw: t.providerRaw as Prisma.InputJsonValue,
  };

  if (existing) {
    await prisma.whatsappTemplate.update({
      where: { id: existing.id },
      data,
    });
    return "updated";
  }
  await prisma.whatsappTemplate.create({
    data: {
      ...(data as Prisma.WhatsappTemplateUncheckedCreateInput),
      createdById: createdById ?? undefined,
    },
  });
  return "created";
}
