import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import {
  generateUniqueSlug,
  generateUniqueLocaleSlug,
  normalizeUserSlug,
} from "@/lib/slug";
import { CATEGORY_ACTIVE_OR_UNSET } from "@/lib/campaign/soft-delete-filter";

// GET: supports locale-aware translations, search, cursor pagination, optional counts, and sorting
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const cursor = params.get('cursor');
    const limit = Math.min(Number(params.get('limit')) || 100, 1000); // caps at 1000
    const locale = params.get('locale') || 'ar';
    const search = params.get('search')?.toLowerCase();
    const includeCounts = params.get('counts') === 'true';
    const activeCounts = params.get('activeCounts') === 'true';
    const sortBy = params.get('sortBy') || 'order';
    // Mirrors the campaigns pattern: default = active categories only; opt in
    // to archived rows with isActiveFalse=true (or includeInactive=true).
    const includeInactive =
      params.get('isActiveFalse') === 'true' ||
      params.get('includeInactive') === 'true';

    // Build order
    const orderBy: any = sortBy === 'name' ? { name: 'asc' } : { order: 'asc' };

    const categories = await prisma.category.findMany({
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      orderBy,
      // Pre-existing categories may have `isActive` unset entirely (Prisma+MongoDB
      // doesn't backfill defaults on read). CATEGORY_ACTIVE_OR_UNSET is the
      // OR-of-(true/null/isSet:false) form proven to match legacy rows.
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
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, name: true, description: true, slug: true }
        },
        ...(includeCounts
          ? { _count: { select: { campaigns: activeCounts ? { where: { isActive: true } } : true } } }
          : {})
      }
    });

    // Search filtering (in-memory for translated fields)
    let filtered = categories;
    if (search) {
      filtered = categories.filter(cat => {
        const t = pickTranslation(cat.translations, locale);
        const name = t?.name || cat.name || '';
        const description = t?.description || cat.description || '';
        return (
          name.toLowerCase().includes(search) ||
          description.toLowerCase().includes(search)
        );
      });
    }

    const hasMore = filtered.length > limit;
    const items = hasMore ? filtered.slice(0, -1) : filtered;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    const transformed = items.map(cat => {
      const t = pickTranslation(cat.translations, locale);
      return {
        id: cat.id,
        // Locale-aware slug surfaced for canonical URLs.
        slug: (t as { slug?: string | null } | undefined)?.slug || cat.slug || null,
        baseSlug: cat.slug ?? null,
        name: t?.name || cat.name,
        description: t?.description || cat.description,
        image: cat.image,
        icon: cat.icon,
        order: cat.order,
        isActive: cat.isActive ?? true,
        campaignCount: cat._count?.campaigns ?? undefined,
      };
    });

    return NextResponse.json({
      items: transformed,
      nextCursor,
      hasMore,
      filters: { search, locale, includeCounts, activeCounts, includeInactive, sortBy, limit }
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

// POST: admin-only; supports creating translations in a transaction
export async function POST(request: NextRequest) {
  try {
    // Auth check: only admins can create categories
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'categories');
    if (denied) return denied;

    const data = await request.json();
    const { name, description, image, icon, order, translations } = data;

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    // English is required.
    const enTrans = translations?.en;
    const enName: string | undefined =
      typeof enTrans?.name === "string" ? enTrans.name.trim() : undefined;
    if (!enName) {
      return NextResponse.json(
        { error: "English category name is required" },
        { status: 400 }
      );
    }

    // Prepare translations payload (exclude default locale 'ar'). The actual slug per
    // locale is computed inside the transaction for uniqueness.
    const translationData: {
      locale: string;
      name: string;
      description?: string;
      requestedSlug: string | null;
    }[] = [];
    if (translations && typeof translations === 'object') {
      for (const [locale, t] of Object.entries(translations)) {
        if (locale !== 'ar' && t && typeof t === 'object') {
          const tt: any = t;
          if (tt.name) {
            translationData.push({
              locale,
              name: tt.name,
              description: tt.description || '',
              requestedSlug: normalizeUserSlug(tt.slug),
            });
          }
        }
      }
    }

    // Auto-generate slug from English name (always); admin can override.
    const requestedSlug = normalizeUserSlug(data.slug);
    const slug = await generateUniqueSlug(
      prisma.category as any,
      requestedSlug ?? enName,
      { fallbackPrefix: "category" }
    );

    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          name,
          slug,
          description: description || '',
          image: image || '',
          icon: icon || '',
          order: order ?? 0,
        }
      });

      // Sequential creates so the per-locale slug uniqueness check observes prior writes.
      for (const t of translationData) {
        const localeSlug = await generateUniqueLocaleSlug(
          tx.categoryTranslation as any,
          t.requestedSlug ?? t.name,
          { locale: t.locale, fallbackPrefix: "category" }
        );
        await tx.categoryTranslation.create({
          data: {
            categoryId: created.id,
            locale: t.locale,
            name: t.name,
            description: t.description || '',
            slug: localeSlug,
          },
        });
      }

      return created;
    });

    const full = await prisma.category.findUnique({
      where: { id: category.id },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        image: true,
        icon: true,
        order: true,
        translations: { select: { locale: true, name: true, description: true, slug: true } }
      }
    });

    const actor = session!.user;
    await writeAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? "ADMIN",
      action: "CATEGORY_CREATE",
      messageAr: `${actor.name ?? "مسؤول"} أنشأ حملةًا جديدًا: ${full?.name ?? name}`,
      entityType: "Category",
      entityId: category.id,
    });

    return NextResponse.json(full, { status: 201 });

  } catch (error) {
    console.error('Error creating category:', error);

    if (error instanceof Error) {
      if (error.message.includes('Unique') || error.message.includes('unique')) {
        return NextResponse.json({ error: 'Category with this name already exists' }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}
