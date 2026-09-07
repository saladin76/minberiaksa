import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import {
  generateUniqueSlug,
  generateUniqueLocaleSlug,
  normalizeUserSlug,
} from "@/lib/slug";

// GET: list post categories with locale-aware translations, search, and paging
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const cursor = params.get('cursor');
    const limit = Math.min(Number(params.get('limit')) || 100, 1000);
    const locale = params.get('locale') || 'ar';
    const search = params.get('search')?.toLowerCase();
    const includeCounts = params.get('counts') === 'true';

    const categories = await prisma.postCategory.findMany({
      take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        title: true,
        description: true,
        image: true,
        createdAt: true,
        translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, name: true, title: true, description: true, image: true, slug: true } },
        ...(includeCounts ? { _count: { select: { posts: true } } } : {}),
      }
    });

    let filtered = categories;
    if (search) {
      filtered = categories.filter(cat => {
        const t = pickTranslation(cat.translations, locale);
        const name = t?.name || cat.name || '';
        const title = t?.title || cat.title || '';
        const desc = t?.description || cat.description || '';
        return (
          name.toLowerCase().includes(search) ||
          title.toLowerCase().includes(search) ||
          desc.toLowerCase().includes(search)
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
        slug: (t as { slug?: string | null } | undefined)?.slug || cat.slug || null,
        baseSlug: cat.slug ?? null,
        name: t?.name || cat.name,
        title: t?.title || cat.title,
        description: t?.description || cat.description,
        image: t?.image || cat.image,
        postCount: cat._count?.posts ?? undefined,
        createdAt: cat.createdAt,
      };
    });

    return NextResponse.json({ items: transformed, nextCursor, hasMore, filters: { locale, limit, search } });
  } catch (error) {
    console.error('Error fetching post categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

// POST: create post category (admin-only) with optional translations
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "blog");
    if (denied) return denied;

    const data = await request.json();
    const { name, title, description, image, translations } = data;

    if (!name) return NextResponse.json({ error: 'Category name is required' }, { status: 400 });

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

    const translationData: {
      locale: string;
      name: string;
      title?: string;
      description?: string;
      image?: string;
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
              title: tt.title || '',
              description: tt.description || '',
              image: tt.image || '',
              requestedSlug: normalizeUserSlug(tt.slug),
            });
          }
        }
      }
    }

    // Auto-generate slug from English name (always); admin can override.
    const requestedSlug = normalizeUserSlug(data.slug);
    const slug = await generateUniqueSlug(
      prisma.postCategory as any,
      requestedSlug ?? enName,
      { fallbackPrefix: "blog-category" }
    );

    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.postCategory.create({ data: { name, slug, title: title || '', description: description || '', image: image || '' } });

      // Sequential creates so the per-locale slug uniqueness check observes prior writes.
      for (const t of translationData) {
        const localeSlug = await generateUniqueLocaleSlug(
          tx.postCategoryTranslation as any,
          t.requestedSlug ?? t.name,
          { locale: t.locale, fallbackPrefix: "blog-category" }
        );
        await tx.postCategoryTranslation.create({
          data: {
            categoryId: created.id,
            locale: t.locale,
            name: t.name,
            title: t.title,
            description: t.description,
            image: t.image,
            slug: localeSlug,
          },
        });
      }

      return created;
    });

    const full = await prisma.postCategory.findUnique({
      where: { id: category.id },
      select: {
        id: true,
        slug: true,
        name: true,
        title: true,
        description: true,
        image: true,
        translations: {
          select: { locale: true, name: true, title: true, description: true, image: true, slug: true },
        },
      },
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "POST_CATEGORY_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ تصنيفًا للمدونة: ${full?.name ?? name}`,
      entityType: "PostCategory",
      entityId: category.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error('Error creating post category:', error);
    if (error instanceof Error && (error.message.includes('Unique') || error.message.includes('unique'))) {
      return NextResponse.json({ error: 'Category with this name already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}