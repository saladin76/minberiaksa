import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  VIDEO_WITH_TRANSLATIONS_SELECT,
  buildVideoScalars,
  isVideoType,
  parseVideoTranslations,
  videoLiveWhere,
} from "@/lib/content/video-write";

/**
 * GET  /api/videos — the public list, narrowed to one locale and optionally one type.
 * POST /api/videos — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";
    const typeParam = request.nextUrl.searchParams.get("type");
    const type = isVideoType(typeParam) ? typeParam : undefined;

    const rows = await prisma.video.findMany({
      where: videoLiveWhere(locale, type),
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        type: true,
        title: true,
        youtubeId: true,
        url: true,
        startSeconds: true,
        thumbnail: true,
        regionKey: true,
        showOnHome: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true },
        },
      },
    });

    const items = rows.map((v) => ({
      id: v.id,
      slug: v.slug,
      type: v.type,
      title: pickTranslation(v.translations, locale)?.title ?? v.title,
      youtubeId: v.youtubeId ?? "",
      url: v.url ?? "",
      startSeconds: v.startSeconds ?? null,
      thumbnail: v.thumbnail ?? "",
      regionKey: v.regionKey ?? "",
      showOnHome: v.showOnHome,
      order: v.order,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching videos:", error);
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildVideoScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }
    /* A video carrying neither an id nor a URL renders as an empty frame on the
       site, so refuse it here rather than let it publish. */
    if (!scalars.youtubeId && !scalars.url) {
      return NextResponse.json(
        { error: "أدخل معرّف يوتيوب أو رابط الفيديو" },
        { status: 400 }
      );
    }

    const { write } = parseVideoTranslations(data.translations);

    const full = await prisma.video.create({
      data: { ...scalars, ...(write.length ? { translations: { create: write } } : {}) },
      select: VIDEO_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "VIDEO_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ فيديو: ${full.title}`,
      entityType: "Video",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating video:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء الفيديو") },
      { status: 500 }
    );
  }
}
