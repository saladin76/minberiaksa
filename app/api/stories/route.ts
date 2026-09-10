import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  STORY_WITH_TRANSLATIONS_SELECT,
  buildStoryScalars,
  parseStoryTranslations,
  storyLiveWhere,
} from "@/lib/content/story-write";

/**
 * GET  /api/stories — the public rail: active stories inside their window.
 * POST /api/stories — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const rows = await prisma.story.findMany({
      where: storyLiveWhere(),
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        image: true,
        linkUrl: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true },
        },
      },
    });

    const items = rows.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: pickTranslation(s.translations, locale)?.title ?? s.title,
      image: s.image,
      linkUrl: s.linkUrl ?? "",
      order: s.order,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return NextResponse.json({ error: "Failed to fetch stories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildStoryScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }
    if (!scalars.image) {
      return NextResponse.json({ error: "صورة القصة مطلوبة" }, { status: 400 });
    }

    const { write } = parseStoryTranslations(data.translations);

    const full = await prisma.story.create({
      data: { ...scalars, ...(write.length ? { translations: { create: write } } : {}) },
      select: STORY_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "STORY_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ قصة: ${full.title}`,
      entityType: "Story",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating story:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء القصة") },
      { status: 500 }
    );
  }
}
