import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  REPORT_WITH_TRANSLATIONS_SELECT,
  buildReportScalarPatch,
  parseDocumentTranslations,
} from "@/lib/content/library-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const report = await prisma.report.findUnique({
      where: { id },
      select: REPORT_WITH_TRANSLATIONS_SELECT,
    });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error fetching report:", error);
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildReportScalarPatch(body);

    /* `translations` absent — which is what the list page toggle sends — must
       touch no translation rows at all. */
    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseDocumentTranslations(body.translations);

    /* One nested write rather than an awaited upsert per locale: the form posts
       every locale at once, and sequential upserts inside an interactive
       transaction are what used to exceed Prisma's 5s timeout on this cluster. */
    const full = await prisma.report.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { reportId_locale: { reportId: id, locale: t.locale } },
                        create: { locale: t.locale, title: t.title, description: t.description },
                        update: { title: t.title, description: t.description },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
      },
      select: REPORT_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "REPORT_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث تقريرًا: ${full.title}`,
      entityType: "Report",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating report:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث التقرير") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    /* Read the title before deleting: the audit entry is useless if it can only
       name an id that no longer resolves to anything. */
    const existing = await prisma.report.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // Translations cascade from the schema.
    await prisma.report.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "REPORT_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف تقريرًا: ${existing.title}`,
      entityType: "Report",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting report:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف التقرير") },
      { status: 500 }
    );
  }
}
