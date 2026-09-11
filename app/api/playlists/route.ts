import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  PLAYLIST_WITH_CHILDREN_SELECT,
  buildPlaylistScalars,
  isPlaylistKind,
  parsePlaylistTranslations,
  parsePlaylistVideos,
} from "@/lib/content/playlist-write";

/**
 * GET  /api/playlists — the public list with active episodes, one locale.
 *      `?kind=PROGRAM|SERIES` narrows it.
 * POST /api/playlists — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";
    const kindParam = request.nextUrl.searchParams.get("kind");
    const kind = isPlaylistKind(kindParam) ? kindParam : undefined;

    const rows = await prisma.videoPlaylist.findMany({
      where: { isActive: true, ...(kind ? { kind } : {}) },
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        youtubePlaylistUrl: true,
        kind: true,
        coverImage: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true, description: true },
        },
        videos: {
          where: { isActive: true },
          orderBy: { order: "asc" },
          select: { id: true, youtubeId: true, url: true, thumbnail: true, title: true, durationSeconds: true },
        },
      },
    });

    const items = rows.map((p) => {
      const t = pickTranslation(p.translations, locale);
      return {
        id: p.id,
        slug: p.slug,
        title: t?.title ?? p.title,
        description: t?.description || p.description || "",
        youtubePlaylistUrl: p.youtubePlaylistUrl ?? "",
        kind: p.kind,
        coverImage: p.coverImage ?? "",
        order: p.order,
        videos: p.videos.map((v) => ({
          id: v.id,
          youtubeId: v.youtubeId,
          url: v.url,
          thumbnail: v.thumbnail ?? "",
          title: v.title ?? "",
          durationSeconds: v.durationSeconds ?? null,
        })),
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching playlists:", error);
    return NextResponse.json({ error: "Failed to fetch playlists" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildPlaylistScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }

    const { write } = parsePlaylistTranslations(data.translations);
    const videos = parsePlaylistVideos(data.videos) ?? [];

    const full = await prisma.videoPlaylist.create({
      data: {
        ...scalars,
        ...(write.length ? { translations: { create: write } } : {}),
        ...(videos.length ? { videos: { create: videos } } : {}),
      },
      select: PLAYLIST_WITH_CHILDREN_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "PLAYLIST_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ قائمة تشغيل: ${full.title} (${videos.length} حلقة)`,
      entityType: "VideoPlaylist",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating playlist:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء قائمة التشغيل") },
      { status: 500 }
    );
  }
}
