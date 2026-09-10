import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  BOOKLET_WITH_TRANSLATIONS_SELECT,
  buildBookletScalarPatch,
  parseDocumentTranslations,
} from "@/lib/content/library-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const booklet = await prisma.booklet.findUnique({
      where: { id },
      select: BOOKLET_WITH_TRANSLATIONS_SELECT,
    });
    if (!booklet) return NextResponse.json({ error: "Booklet not found" }, { status: 404 });

    return NextResponse.json(booklet);
  } catch (error) {
    console.error("Error fetching booklet:", error);
    return NextResponse.json({ error: "Failed to fetch booklet" }, { status: 500 });
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
    const patch = buildBookletScalarPatch(body);

    /* `translations` absent — which is what the list page toggle sends — must
       touch no translation rows at all. */
    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseDocumentTranslations(body.translations);

    /* One nested write rather than an awaited upsert per locale: the form posts
       every locale at once, and sequential upserts inside an interactive
       transaction are what used to exceed the 5s transaction timeout here. */
    const full = await prisma.booklet.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { bookletId_locale: { bookletId: id, locale: t.locale } },
                        create: { locale: t.locale, title: t.title, description: t.description },
                        update: { title: t.title, description: t.description },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
      },
      select: BOOKLET_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "BOOKLET_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث كتيبًا: ${full.title}`,
      entityType: "Booklet",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating booklet:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث الكتيب") },
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
    const existing = await prisma.booklet.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) return NextResponse.json({ error: "Booklet not found" }, { status: 404 });

    // Translations cascade from the schema.
    await prisma.booklet.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "BOOKLET_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف كتيبًا: ${existing.title}`,
      entityType: "Booklet",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting booklet:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف الكتيب") },
      { status: 500 }
    );
  }
}
