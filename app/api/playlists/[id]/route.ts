import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  PLAYLIST_WITH_CHILDREN_SELECT,
  buildPlaylistScalarPatch,
  parsePlaylistTranslations,
  parsePlaylistVideos,
} from "@/lib/content/playlist-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const playlist = await prisma.videoPlaylist.findUnique({
      where: { id },
      select: PLAYLIST_WITH_CHILDREN_SELECT,
    });
    if (!playlist) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });

    return NextResponse.json(playlist);
  } catch (error) {
    console.error("Error fetching playlist:", error);
    return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 });
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
    const patch = buildPlaylistScalarPatch(body);

    /* Absent keys touch nothing: the list page toggle sends only `isActive`,
       and must leave both the translations and the episodes alone. */
    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parsePlaylistTranslations(body.translations);
    const videos = parsePlaylistVideos(body.videos);

    const full = await prisma.videoPlaylist.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { playlistId_locale: { playlistId: id, locale: t.locale } },
                        create: { locale: t.locale, title: t.title, description: t.description },
                        update: { title: t.title, description: t.description },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
        /* Episodes are replaced wholesale — the posted list IS the list. Both
           halves run inside the one nested write, so a failure leaves the old
           episodes in place rather than an empty playlist. */
        ...(videos !== undefined
          ? { videos: { deleteMany: {}, ...(videos.length ? { create: videos } : {}) } }
          : {}),
      },
      select: PLAYLIST_WITH_CHILDREN_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "PLAYLIST_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث قائمة تشغيل: ${full.title}`,
      entityType: "VideoPlaylist",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating playlist:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث قائمة التشغيل") },
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

    const existing = await prisma.videoPlaylist.findUnique({
      where: { id },
      select: { id: true, title: true, _count: { select: { videos: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });

    // Translations and episodes both cascade from the schema.
    await prisma.videoPlaylist.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "PLAYLIST_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف قائمة تشغيل: ${existing.title} (${existing._count.videos} حلقة)`,
      entityType: "VideoPlaylist",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting playlist:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف قائمة التشغيل") },
      { status: 500 }
    );
  }
}
