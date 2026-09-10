import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  REPORT_WITH_TRANSLATIONS_SELECT,
  buildReportScalars,
  parseDocumentTranslations,
} from "@/lib/content/library-write";

/**
 * GET  /api/reports — the public list of published reports, newest year first.
 * POST /api/reports — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const rows = await prisma.report.findMany({
      where: { isPublished: true },
      orderBy: [{ year: "desc" }, { order: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        fileUrl: true,
        coverImage: true,
        year: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true, description: true },
        },
      },
    });

    const items = rows.map((r) => {
      const t = pickTranslation(r.translations, locale);
      return {
        id: r.id,
        slug: r.slug,
        title: t?.title ?? r.title,
        /* Falls back per field: a locale may translate the title and leave the
           description empty, and the Arabic description is better than none. */
        description: t?.description || r.description || "",
        fileUrl: r.fileUrl,
        coverImage: r.coverImage ?? "",
        year: r.year ?? null,
        order: r.order,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildReportScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }
    /* The whole point of a report row is the document it links to. */
    if (!scalars.fileUrl) {
      return NextResponse.json({ error: "ملف التقرير (PDF) مطلوب" }, { status: 400 });
    }

    const { write } = parseDocumentTranslations(data.translations);

    const full = await prisma.report.create({
      data: { ...scalars, ...(write.length ? { translations: { create: write } } : {}) },
      select: REPORT_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "REPORT_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ تقريرًا: ${full.title}`,
      entityType: "Report",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating report:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء التقرير") },
      { status: 500 }
    );
  }
}
