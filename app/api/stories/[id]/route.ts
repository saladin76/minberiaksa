import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  STORY_WITH_TRANSLATIONS_SELECT,
  buildStoryScalarPatch,
  parseStorySlides,
  parseStoryTranslations,
  slidesCreateData,
} from "@/lib/content/story-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const story = await prisma.story.findUnique({
      where: { id },
      select: STORY_WITH_TRANSLATIONS_SELECT,
    });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    return NextResponse.json(story);
  } catch (error) {
    console.error("Error fetching story:", error);
    return NextResponse.json({ error: "Failed to fetch story" }, { status: 500 });
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
    const patch = buildStoryScalarPatch(body);

    /* `translations` absent — which is what the list page's active toggle sends
       — must touch no translation rows at all. */
    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseStoryTranslations(body.translations);
    const slides = parseStorySlides(body.slides);

    /* Replacing the slide list with nothing would leave a ring that opens onto
       nothing. An absent key is fine — that is the toggle path — but an
       explicit empty list is refused. */
    if (slides !== undefined && slides.length === 0) {
      return NextResponse.json({ error: "أضف شريحة واحدة على الأقل" }, { status: 400 });
    }

    /* One nested write rather than an awaited upsert per locale: the form posts
       every locale at once, and sequential upserts inside an interactive
       transaction are what used to exceed Prisma's 5s timeout on this cluster. */
    const full = await prisma.story.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { storyId_locale: { storyId: id, locale: t.locale } },
                        create: { locale: t.locale, title: t.title },
                        update: { title: t.title },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
        /* Slides are replaced wholesale — the posted list IS the list. Both
           halves run inside the one nested write, so a failure leaves the old
           slides in place rather than none. Slide translations cascade. */
        ...(slides !== undefined
          ? { slides: { deleteMany: {}, create: slidesCreateData(slides) } }
          : {}),
      },
      select: STORY_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "STORY_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث قصة: ${full.title}`,
      entityType: "Story",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating story:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث القصة") },
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
    const existing = await prisma.story.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    // Translations and slides both cascade from the schema.
    await prisma.story.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "STORY_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف قصة: ${existing.title}`,
      entityType: "Story",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting story:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف القصة") },
      { status: 500 }
    );
  }
}
