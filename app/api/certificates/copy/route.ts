import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { messagesFor } from "@/i18n/locale-messages";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import {
  RECEIPT_FIELDS,
  RECEIPT_LITERAL_DEFAULTS,
  RECEIPT_ORG_DEFAULTS,
  THANKS_FIELDS,
  WAQF_FIELDS,
  sanitizeCopyOverrides,
  type CertificateCopyOverrides,
} from "@/lib/certificates/copy-defaults";

/**
 * GET /api/certificates/copy — the dashboard's overrides of the certificate and
 *     receipt wording, with the i18n defaults every field falls back to, per
 *     locale. `siteContent`: the wording is site content, not a secret, but
 *     the defaults bundle is large and only the editor needs it.
 * PUT /api/certificates/copy — replace the overrides. Empty strings clear a
 *     field back to its i18n text.
 */

async function getOrCreateSettings() {
  const existing = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.globalSettings.create({ data: {} });
}

function defaultsFor(locale: string): Record<string, Record<string, string>> {
  const ns = (messagesFor(locale).certificates ?? {}) as Record<string, unknown>;
  const pick = (key: string | null) => (key && typeof ns[key] === "string" ? (ns[key] as string) : "");
  return {
    thanks: Object.fromEntries(THANKS_FIELDS.map((f) => [f.name, pick(f.i18nKey)])),
    waqf: Object.fromEntries(WAQF_FIELDS.map((f) => [f.name, pick(f.i18nKey)])),
    receipt: Object.fromEntries(
      RECEIPT_FIELDS.map((f) => [f.name, f.i18nKey ? pick(f.i18nKey) : RECEIPT_LITERAL_DEFAULTS[f.name as keyof typeof RECEIPT_LITERAL_DEFAULTS] ?? ""])
    ),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const row = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { certificateCopy: true, updatedAt: true } });
    const overrides = sanitizeCopyOverrides(row?.certificateCopy ?? null);
    const defaults = Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, defaultsFor(locale)]));
    return NextResponse.json({ overrides, defaults, orgDefaults: RECEIPT_ORG_DEFAULTS, updatedAt: row?.updatedAt ?? null });
  } catch (e) {
    console.error("GET /api/certificates/copy:", e);
    return NextResponse.json({ error: "Failed to read the certificate wording" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const overrides: CertificateCopyOverrides = sanitizeCopyOverrides(body.overrides ?? body);
    const existing = await getOrCreateSettings();
    const saved = await prisma.globalSettings.update({
      where: { id: existing.id },
      data: { certificateCopy: overrides as unknown as Prisma.InputJsonValue },
      select: { certificateCopy: true, updatedAt: true },
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "CERTIFICATE_COPY_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل نصوص الشهادات وإيصال التبرع`,
      entityType: "GlobalSettings",
      entityId: existing.id,
    });

    return NextResponse.json({ overrides: sanitizeCopyOverrides(saved.certificateCopy), updatedAt: saved.updatedAt });
  } catch (e) {
    console.error("PUT /api/certificates/copy:", e);
    return NextResponse.json({ error: "Failed to save the certificate wording" }, { status: 500 });
  }
}
