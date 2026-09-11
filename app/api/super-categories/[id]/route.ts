import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  SUPER_CATEGORY_WITH_CHILDREN_SELECT,
  buildSuperCategoryScalarPatch,
  parseSuperCategoryBlocks,
  parseSuperCategoryItems,
  parseSuperCategoryTranslations,
} from "@/lib/content/super-category-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const row = await prisma.superCategory.findUnique({
      where: { id },
      select: SUPER_CATEGORY_WITH_CHILDREN_SELECT,
    });
    if (!row) return NextResponse.json({ error: "Super category not found" }, { status: 404 });

    return NextResponse.json(row);
  } catch (error) {
    console.error("Error fetching super category:", error);
    return NextResponse.json({ error: "Failed to fetch super category" }, { status: 500 });
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
    const patch = buildSuperCategoryScalarPatch(body);

    /* Absent keys touch nothing: the list page's toggle sends only `isActive`
       and must leave the translations, the linked content and the page's
       sections exactly as they are. */
    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseSuperCategoryTranslations(body.translations);
    const items = parseSuperCategoryItems(body.items);
    const blocks = parseSuperCategoryBlocks(body.blocks);

    const full = await prisma.superCategory.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { superCategoryId_locale: { superCategoryId: id, locale: t.locale } },
                        create: {
                          locale: t.locale,
                          title: t.title,
                          subtitle: t.subtitle,
                          intro: t.intro,
                          verseTranslation: t.verseTranslation,
                          verseAttribution: t.verseAttribution,
                          logoImage: t.logoImage,
                          ctaPrimaryLabel: t.ctaPrimaryLabel,
                          ctaSecondaryLabel: t.ctaSecondaryLabel,
                          ctaTertiaryLabel: t.ctaTertiaryLabel,
                          metaTitle: t.metaTitle,
                          metaDescription: t.metaDescription,
                        },
                        update: {
                          title: t.title,
                          subtitle: t.subtitle,
                          intro: t.intro,
                          verseTranslation: t.verseTranslation,
                          verseAttribution: t.verseAttribution,
                          logoImage: t.logoImage,
                          ctaPrimaryLabel: t.ctaPrimaryLabel,
                          ctaSecondaryLabel: t.ctaSecondaryLabel,
                          ctaTertiaryLabel: t.ctaTertiaryLabel,
                          metaTitle: t.metaTitle,
                          metaDescription: t.metaDescription,
                        },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
        /* Both child lists are replaced wholesale — the posted list IS the
           list. Every half runs inside the one nested write, so a failure
           leaves the previous page intact rather than a stripped one. */
        ...(items !== undefined
          ? { items: { deleteMany: {}, ...(items.length ? { create: items } : {}) } }
          : {}),
        ...(blocks !== undefined
          ? { blocks: { deleteMany: {}, ...(blocks.length ? { create: blocks } : {}) } }
          : {}),
      },
      select: SUPER_CATEGORY_WITH_CHILDREN_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SUPER_CATEGORY_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث القسم الكبير: ${full.title}`,
      entityType: "SuperCategory",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating super category:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث القسم الكبير") },
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

    const existing = await prisma.superCategory.findUnique({
      where: { id },
      select: { id: true, title: true, _count: { select: { items: true, blocks: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Super category not found" }, { status: 404 });

    /* Translations, blocks and item pointers all cascade from the schema. The
       content those pointers named is untouched — a super category owns the
       page, not the campaigns and articles on it. */
    await prisma.superCategory.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SUPER_CATEGORY_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف القسم الكبير: ${existing.title}`,
      entityType: "SuperCategory",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting super category:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف القسم الكبير") },
      { status: 500 }
    );
  }
}
