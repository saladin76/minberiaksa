import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  VIDEO_WITH_TRANSLATIONS_SELECT,
  buildVideoScalarPatch,
  parseVideoTranslations,
} from "@/lib/content/video-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const video = await prisma.video.findUnique({
      where: { id },
      select: VIDEO_WITH_TRANSLATIONS_SELECT,
    });
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    return NextResponse.json(video);
  } catch (error) {
    console.error("Error fetching video:", error);
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 500 });
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
    const patch = buildVideoScalarPatch(body);

    /* `translations` absent — which is what the list page toggles send — must
       touch no translation rows at all. */
    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseVideoTranslations(body.translations);

    /* One nested write rather than an awaited upsert per locale: the form posts
       every locale at once, and sequential upserts inside an interactive
       transaction are what used to exceed Prisma's 5s timeout on this cluster. */
    const full = await prisma.video.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { videoId_locale: { videoId: id, locale: t.locale } },
                        create: { locale: t.locale, title: t.title },
                        update: { title: t.title },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
      },
      select: VIDEO_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "VIDEO_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث فيديو: ${full.title}`,
      entityType: "Video",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating video:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث الفيديو") },
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
    const existing = await prisma.video.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    // Translations cascade from the schema.
    await prisma.video.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "VIDEO_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف فيديو: ${existing.title}`,
      entityType: "Video",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting video:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف الفيديو") },
      { status: 500 }
    );
  }
}
