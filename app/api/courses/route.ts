import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  COURSE_WITH_CHILDREN_SELECT,
  buildCourseScalars,
  parseCourseTranslations,
  parseCourseVideos,
} from "@/lib/content/course-write";

/**
 * GET  /api/courses — the public list, pinned first, one locale.
 * POST /api/courses — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const rows = await prisma.course.findMany({
      where: { isActive: true },
      orderBy: [{ isPinned: "desc" }, { order: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        coverImage: true,
        introVideoId: true,
        introVideoUrl: true,
        unitsCount: true,
        isPinned: true,
        isExternal: true,
        externalUrl: true,
        hasDetailPage: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true, description: true },
        },
        videos: {
          orderBy: { order: "asc" },
          select: { id: true, youtubeId: true, url: true, thumbnail: true, title: true },
        },
      },
    });

    const items = rows.map((c) => {
      const t = pickTranslation(c.translations, locale);
      return {
        id: c.id,
        slug: c.slug,
        title: t?.title ?? c.title,
        description: t?.description || c.description || "",
        coverImage: c.coverImage ?? "",
        introVideoId: c.introVideoId ?? "",
        introVideoUrl: c.introVideoUrl ?? "",
        unitsCount: c.unitsCount ?? null,
        isPinned: c.isPinned,
        isExternal: c.isExternal,
        externalUrl: c.externalUrl ?? "",
        hasDetailPage: c.hasDetailPage,
        order: c.order,
        videos: c.videos.map((v) => ({
          id: v.id,
          youtubeId: v.youtubeId,
          url: v.url,
          thumbnail: v.thumbnail ?? "",
          title: v.title ?? "",
        })),
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildCourseScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }
    /* An external course with nowhere to go is a dead card. */
    if (scalars.isExternal && !scalars.externalUrl) {
      return NextResponse.json({ error: "الدورة الخارجية تحتاج رابطًا" }, { status: 400 });
    }

    const { write } = parseCourseTranslations(data.translations);
    const videos = parseCourseVideos(data.videos) ?? [];

    const full = await prisma.course.create({
      data: {
        ...scalars,
        ...(write.length ? { translations: { create: write } } : {}),
        ...(videos.length ? { videos: { create: videos } } : {}),
      },
      select: COURSE_WITH_CHILDREN_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "COURSE_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ دورة: ${full.title}`,
      entityType: "Course",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating course:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء الدورة") },
      { status: 500 }
    );
  }
}
