import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  BOOKLET_WITH_TRANSLATIONS_SELECT,
  buildBookletScalars,
  parseDocumentTranslations,
} from "@/lib/content/library-write";

/**
 * GET  /api/booklets — the public list of published booklets.
 * POST /api/booklets — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const rows = await prisma.booklet.findMany({
      where: { isPublished: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        fileUrl: true,
        coverImage: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true, description: true },
        },
      },
    });

    const items = rows.map((b) => {
      const t = pickTranslation(b.translations, locale);
      return {
        id: b.id,
        slug: b.slug,
        title: t?.title ?? b.title,
        /* Falls back per field: a locale may translate the title and leave the
           description empty, and the Arabic description is better than none. */
        description: t?.description || b.description || "",
        fileUrl: b.fileUrl,
        coverImage: b.coverImage ?? "",
        order: b.order,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching booklets:", error);
    return NextResponse.json({ error: "Failed to fetch booklets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildBookletScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }
    /* The whole point of a booklet row is the document it links to. */
    if (!scalars.fileUrl) {
      return NextResponse.json({ error: "ملف الكتيب (PDF) مطلوب" }, { status: 400 });
    }

    const { write } = parseDocumentTranslations(data.translations);

    const full = await prisma.booklet.create({
      data: { ...scalars, ...(write.length ? { translations: { create: write } } : {}) },
      select: BOOKLET_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "BOOKLET_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ كتيبًا: ${full.title}`,
      entityType: "Booklet",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating booklet:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء الكتيب") },
      { status: 500 }
    );
  }
}
