import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import type { TReaderDocument } from "@usewaypoint/email-builder";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { resolveDonorIds } from "@/lib/users/donor-filter";
import { loadContextsForUserIds } from "@/lib/templates/variables";
import { renderEmailHtml, renderEmailSubject } from "@/lib/templates/render";
import { pickLocale, resolveEmailVariant } from "@/lib/templates/locale-resolver";
import { logSentMessage } from "@/lib/messaging/log-sent";
import { getActiveElasticEmailRuntimeConfig } from "@/lib/communication/runtime-config";
import { sendArchivedEmail } from "@/lib/communication/system-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sendSchema = z.object({
  templateId: z.string().min(1),
  locale: z.string().optional(),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("user"), userId: z.string().min(1) }),
    z.object({
      kind: z.literal("filtered"),
      filters: z.object({
        search: z.string().optional(),
        preferredLang: z.string().optional(),
        badgeId: z.string().optional(),
        gender: z.string().optional(),
        minAge: z.number().int().min(0).max(130).optional(),
        maxAge: z.number().int().min(0).max(130).optional(),
      }),
    }),
  ]),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;
  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  const { templateId, target } = parsed.data;
  const template = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const userIds = target.kind === "user" ? [target.userId] : await resolveDonorIds(target.filters);
  if (!userIds.length) return NextResponse.json({ sent: 0, failed: [], skipped: 0, total: 0 });
  const contexts = await loadContextsForUserIds(userIds);
  const actor = auditActorFromDashboardSession(session!);
  const runtimeConfig = await getActiveElasticEmailRuntimeConfig();
  let sent = 0;
  let skipped = 0;
  const failed: { to: string; error: string }[] = [];

  for (const id of userIds) {
    const ctx = contexts.get(id);
    if (!ctx || !ctx.user.email) {
      skipped += 1;
      if (ctx) {
        const locale = pickLocale({ override: parsed.data.locale, recipientLang: ctx.user.preferredLang });
        const variant = resolveEmailVariant(template, locale);
        await logSentMessage({ channel: "EMAIL", origin: "MANUAL", status: "SKIPPED", templateId: template.id, templateName: template.name, locale, recipientUserId: ctx.user.id, recipientEmail: null, recipientName: ctx.user.name || null, renderedSubject: variant.subject, renderedBody: "", variables: ctx as unknown as Prisma.InputJsonValue, errorMessage: "Recipient has no email address", actorId: actor.actorId ?? null, actorName: actor.actorName ?? null });
      }
      continue;
    }
    const locale = pickLocale({ override: parsed.data.locale, recipientLang: ctx.user.preferredLang });
    const variant = resolveEmailVariant(template, locale);
    const subject = renderEmailSubject(variant.subject, ctx);
    const html = await renderEmailHtml(variant.document as TReaderDocument, ctx);
    const result = await sendArchivedEmail({ to: ctx.user.email, subject, html, recipientUserId: ctx.user.id, recipientName: ctx.user.name || null, locale, origin: "MANUAL", purpose: "MARKETING", templateId: template.id, templateName: template.name, createdBy: actor.actorId ?? null }, runtimeConfig);
    const status = result.ok ? "SENT" : result.reason.endsWith("_NOT_CONFIGURED") || result.reason === "PROVIDER_DISABLED" ? "SKIPPED" : "FAILED";
    if (result.ok) sent += 1;
    else if (status === "SKIPPED") skipped += 1;
    else failed.push({ to: ctx.user.email, error: result.reason });
    await logSentMessage({ channel: "EMAIL", origin: "MANUAL", status, templateId: template.id, templateName: template.name, locale, recipientUserId: ctx.user.id, recipientEmail: ctx.user.email, recipientName: ctx.user.name || null, renderedSubject: subject, renderedBody: html, variables: ctx as unknown as Prisma.InputJsonValue, errorMessage: result.ok ? null : result.reason, providerMessageId: result.ok ? result.providerMessageId : null, actorId: actor.actorId ?? null, actorName: actor.actorName ?? null });
  }

  await writeAuditLog({ ...actor, action: "EMAIL_TEMPLATE_SEND", messageAr: `أرسل قالب بريد «${template.name}» — نجح ${sent} / تخطّي ${skipped} / فشل ${failed.length}`, entityType: "EmailTemplate", entityId: template.id, metadata: { target: target.kind, total: userIds.length, sent, skipped, failed: failed.length, localeOverride: parsed.data.locale ?? null }, stream: "TEAM" });
  return NextResponse.json({ total: userIds.length, sent, skipped, failed });
}
