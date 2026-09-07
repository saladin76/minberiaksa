import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { parseSuggestedDonations } from "@/lib/campaign/suggested-donations";
import { generateUniqueSlug, normalizeUserSlug } from "@/lib/slug";
import { NOT_SOFT_DELETED, CATEGORY_ACTIVE_OR_UNSET } from "@/lib/campaign/soft-delete-filter";

// GET: localized categories with optional campaigns (limited per-category), cursor pagination
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(Number(searchParams.get('limit')) || 10, 100);
    const locale = searchParams.get('locale') || 'ar';
    const includeCampaigns = searchParams.get('includeCampaigns') === 'true';
    const campaignLimit = Math.min(Number(searchParams.get('campaignLimit')) || 3, 20);
    const includeCounts = searchParams.get('counts') === 'true';
    const includeInactive =
      searchParams.get('isActiveFalse') === 'true' ||
      searchParams.get('includeInactive') === 'true';

    // Fetch categories (no heavy nested relations by default).
    // Default = active categories; CATEGORY_ACTIVE_OR_UNSET treats legacy
    // rows with unset isActive as active so they don't silently disappear.
    const categories = await prisma.category.findMany({
      take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { order: 'asc' },
      where: includeInactive ? undefined : CATEGORY_ACTIVE_OR_UNSET,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        image: true,
        icon: true,
        order: true,
        isActive: true,
        translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, name: true, description: true } },
        ...(includeCounts ? { _count: { select: { campaigns: true } } } : {})
      }
    });

    const hasMore = categories.length > limit;
    const page = hasMore ? categories.slice(0, -1) : categories;
    const nextCursor = hasMore ? page[page.length - 1]?.id : null;

    // If campaigns requested, batch fetch limited campaigns per category in parallel
    let campaignsByCategory: Record<string, any[]> = {};
    if (includeCampaigns && page.length > 0) {
      const campaignFetches = page.map(cat =>
        prisma.campaign.findMany({
          where: {
            AND: [
              { categoryIds: { has: cat.id } },
              NOT_SOFT_DELETED,
            ],
          },
          take: campaignLimit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            images: true,
            targetAmount: true,
            currentAmount: true,
            isActive: true,
            priority: true,
            createdAt: true,
            suggestedDonations: true,
            translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true } },
            _count: { select: { donations: true } }
          }
        }).then(list => ({ id: cat.id, list }))
      );

      const resolved = await Promise.all(campaignFetches);
      campaignsByCategory = resolved.reduce((acc, cur) => {
        acc[cur.id] = cur.list;
        return acc;
      }, {} as Record<string, any[]>);
    }

    const transformed = page.map(cat => {
      const tCat = pickTranslation(cat.translations, locale);
      return {
        id: cat.id,
        slug: cat.slug ?? null,
        name: tCat?.name || cat.name,
        description: tCat?.description || cat.description,
        image: cat.image,
        icon: cat.icon,
        order: cat.order,
        isActive: cat.isActive ?? true,
        campaignCount: cat._count?.campaigns ?? undefined,
        campaigns: includeCampaigns ? (campaignsByCategory[cat.id] || []).map(c => {
          const tC = pickTranslation(c.translations, locale);
          return {
            id: c.id,
            slug: c.slug ?? null,
            title: tC?.title || c.title,
            description: tC?.description || c.description,
            images: c.images,
            targetAmount: c.targetAmount,
            currentAmount: c.currentAmount,
            isActive: c.isActive,
            priority: c.priority,
            donationCount: c._count?.donations ?? 0,
            progress: (c.currentAmount / Math.max(c.targetAmount, 1)) * 100,
            suggestedDonations: parseSuggestedDonations(c.suggestedDonations),
            createdAt: c.createdAt
          };
        }) : undefined
      };
    });

    return NextResponse.json({ items: transformed, nextCursor, hasMore });

  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

// POST: admin-only; supports translations
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'categories');
    if (denied) return denied;

    const data = await request.json();
    const { name, description, image, icon, order, translations } = data;

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const enTrans = translations?.en;
    const enName: string | undefined =
      typeof enTrans?.name === "string" ? enTrans.name.trim() : undefined;
    if (!enName) {
      return NextResponse.json(
        { error: "English category name is required" },
        { status: 400 }
      );
    }

    const translationData: { locale: string; name: string; description?: string }[] = [];
    if (translations && typeof translations === 'object') {
      for (const [locale, t] of Object.entries(translations)) {
        if (locale === 'ar') continue;
        if (t && typeof t === 'object' && (t as any).name) {
          translationData.push({ locale, name: (t as any).name, description: (t as any).description || '' });
        }
      }
    }

    const requestedSlug = normalizeUserSlug(data.slug);
    const slug = await generateUniqueSlug(
      prisma.category as any,
      requestedSlug ?? enName,
      { fallbackPrefix: "category" }
    );

    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({ data: {
        name,
        slug,
        description: description || '',
        image: image || '',
        icon: icon || '',
        order: order ?? 0
      }});

      if (translationData.length > 0) {
        await tx.categoryTranslation.createMany({ data: translationData.map(t => ({ categoryId: created.id, locale: t.locale, name: t.name, description: t.description || '' })) });
      }

      return created;
    });

    const full = await prisma.category.findUnique({ where: { id: category.id }, select: { id: true, slug: true, name: true, description: true, image: true, icon: true, order: true, translations: { select: { locale: true, name: true, description: true } } } });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "CATEGORY_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ حملةًا (من الواجهة التفصيلية): ${full?.name ?? name}`,
      entityType: "Category",
      entityId: category.id,
    });

    return NextResponse.json(full, { status: 201 });

  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
