import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import {
  SLIDE_WITH_TRANSLATIONS_SELECT,
  buildSlideScalarPatch,
  parseSlideTranslations,
} from "@/lib/slides/slide-write";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const locale = request.nextUrl.searchParams.get('locale') || 'ar';
    const allTranslations = request.nextUrl.searchParams.get('allTranslations') === 'true';
    const slide = await prisma.slide.findUnique({
      where: { id },
      select: {
        id: true, title: true, description: true, image: true,
        showButton: true, buttonText: true, buttonLink: true, isActive: true, order: true,
        translations: { select: { locale: true, title: true, description: true, buttonText: true } },
      },
    });
    if (!slide) return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
    if (allTranslations) return NextResponse.json(slide);
    const t = slide.translations.find(tr => tr.locale === locale);
    return NextResponse.json({
      ...slide,
      title: t?.title ?? slide.title,
      description: t?.description ?? slide.description,
      buttonText: t?.buttonText ?? slide.buttonText,
    });
  } catch (error) {
    console.error('Error fetching slide:', error);
    return NextResponse.json({ error: 'Failed to fetch slide' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'slides');
    if (denied) return denied;
    const body = await request.json();

    // A patch, not a full replace: the list page's active-toggle sends only
    // `{ isActive }`, and an omitted field must keep its stored value.
    const patch = buildSlideScalarPatch(body);
    if ('title' in patch && !patch.title) {
      return NextResponse.json({ error: 'العنوان بالعربية مطلوب' }, { status: 400 });
    }

    // `translations` absent (the toggle) => touch no translation rows at all.
    const { write, clear } = body.translations === undefined
      ? { write: [], clear: [] as string[] }
      : parseSlideTranslations(body.translations);

    // Previously this was an interactive `$transaction` with one awaited upsert
    // per locale — ~10 sequential round trips, which regularly exceeded Prisma's
    // default 5s transaction timeout on this cluster and surfaced as a generic
    // failure. A nested write is atomic on Prisma's side and costs one trip.
    const full = await prisma.slide.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { slideId_locale: { slideId: id, locale: t.locale } },
                        update: { title: t.title, description: t.description, buttonText: t.buttonText },
                        create: { locale: t.locale, title: t.title, description: t.description, buttonText: t.buttonText },
                      })),
                    }
                  : {}),
                // Blanking a locale in the form now removes its row; it used to
                // be skipped, leaving the old text live on the public site.
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
      },
      select: SLIDE_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SLIDE_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل شريحة الهيرو: ${full.title}`,
      entityType: "Slide",
      entityId: id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error('Error updating slide:', error);
    return NextResponse.json({ error: writeErrorMessage(error, 'تعذّر تحديث الشريحة') }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'slides');
    if (denied) return denied;
    // `delete` returns the deleted row, so the separate findUnique that existed
    // only to read the title for the audit message was a wasted round trip.
    // SlideTranslation rows go with it via `onDelete: Cascade`.
    const deleted = await prisma.slide.delete({
      where: { id },
      select: { title: true },
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SLIDE_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف شريحة الهيرو: ${deleted.title || id}`,
      entityType: "Slide",
      entityId: id,
    });

    return NextResponse.json({ message: 'Slide deleted' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting slide:', error);
    // Already gone (e.g. a double-click, or deleted in another tab) is not a
    // failure from the admin's point of view — the row is absent either way.
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2025') {
      return NextResponse.json({ message: 'Slide already deleted' }, { status: 200 });
    }
    return NextResponse.json({ error: writeErrorMessage(error, 'تعذّر حذف الشريحة') }, { status: 500 });
  }
}
