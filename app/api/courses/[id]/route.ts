import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  COURSE_WITH_CHILDREN_SELECT,
  buildCourseScalarPatch,
  parseCourseTranslations,
  parseCourseVideos,
} from "@/lib/content/course-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const course = await prisma.course.findUnique({
      where: { id },
      select: COURSE_WITH_CHILDREN_SELECT,
    });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    return NextResponse.json(course);
  } catch (error) {
    console.error("Error fetching course:", error);
    return NextResponse.json({ error: "Failed to fetch course" }, { status: 500 });
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
    const patch = buildCourseScalarPatch(body);

    /* Absent keys touch nothing: the list page toggles send one flag each, and
       must leave both the translations and the video list alone. */
    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseCourseTranslations(body.translations);
    const videos = parseCourseVideos(body.videos);

    const full = await prisma.course.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { courseId_locale: { courseId: id, locale: t.locale } },
                        create: { locale: t.locale, title: t.title, description: t.description },
                        update: { title: t.title, description: t.description },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
        /* Videos are replaced wholesale — the posted list IS the list. Both
           halves run inside the one nested write, so a failure leaves the old
           videos in place rather than an empty course. */
        ...(videos !== undefined
          ? { videos: { deleteMany: {}, ...(videos.length ? { create: videos } : {}) } }
          : {}),
      },
      select: COURSE_WITH_CHILDREN_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "COURSE_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث دورة: ${full.title}`,
      entityType: "Course",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating course:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث الدورة") },
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

    const existing = await prisma.course.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    // Translations and videos both cascade from the schema.
    await prisma.course.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "COURSE_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف دورة: ${existing.title}`,
      entityType: "Course",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting course:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف الدورة") },
      { status: 500 }
    );
  }
}
