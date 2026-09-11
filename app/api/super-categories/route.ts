import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  SUPER_CATEGORY_WITH_CHILDREN_SELECT,
  buildSuperCategoryScalars,
  parseSuperCategoryBlocks,
  parseSuperCategoryItems,
  parseSuperCategoryTranslations,
} from "@/lib/content/super-category-write";

/**
 * GET  /api/super-categories — the public list, one locale. Titles only; the
 *      page itself is read on the server by `lib/minbar/super-category.ts`.
 * POST /api/super-categories — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const rows = await prisma.superCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        heroImage: true,
        logoImage: true,
        accentColor: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true, subtitle: true, logoImage: true },
        },
      },
    });

    const items = rows.map((row) => {
      const t = pickTranslation(row.translations, locale);
      return {
        id: row.id,
        slug: row.slug,
        title: t?.title ?? row.title,
        subtitle: t?.subtitle || row.subtitle || "",
        heroImage: row.heroImage ?? "",
        logoImage: t?.logoImage || row.logoImage || "",
        accentColor: row.accentColor ?? "",
        order: row.order,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching super categories:", error);
    return NextResponse.json({ error: "Failed to fetch super categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildSuperCategoryScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }

    const { write } = parseSuperCategoryTranslations(data.translations);
    const items = parseSuperCategoryItems(data.items) ?? [];
    const blocks = parseSuperCategoryBlocks(data.blocks) ?? [];

    const full = await prisma.superCategory.create({
      data: {
        ...scalars,
        ...(write.length ? { translations: { create: write } } : {}),
        ...(items.length ? { items: { create: items } } : {}),
        ...(blocks.length ? { blocks: { create: blocks } } : {}),
      },
      select: SUPER_CATEGORY_WITH_CHILDREN_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SUPER_CATEGORY_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ قسمًا كبيرًا: ${full.title} (${items.length} عنصر، ${blocks.length} قسم فرعي)`,
      entityType: "SuperCategory",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating super category:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء القسم الكبير") },
      { status: 500 }
    );
  }
}
