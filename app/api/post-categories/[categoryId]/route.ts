import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import {
  generateUniqueSlug,
  generateUniqueLocaleSlug,
  normalizeUserSlug,
  whereByIdOrAnyLocaleSlug,
  whereByIdOrSlug,
} from "@/lib/slug";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  try {
    const { categoryId: catIdOrSlug } = await params;
    const locale = req.headers.get('x-locale') || new URL(req.url).searchParams.get('locale') || 'ar';

    const category = await prisma.postCategory.findFirst({
      // Any locale, not just this one: a locale without its own slug canonically
      // uses the English one, so those URLs must resolve here too. Locale still
      // selects which translation is returned, not which slugs are addressable.
      where: whereByIdOrAnyLocaleSlug(catIdOrSlug),
      select: {
        id: true,
        slug: true,
        name: true,
        title: true,
        description: true,
        image: true,
        createdAt: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, name: true, title: true, description: true, image: true, slug: true },
        },
        posts: {
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            content: true,
            image: true,
            published: true,
            createdAt: true,
            updatedAt: true,
            translations: {
              where: translationLocaleWhere(locale),
              take: 2,
              select: { locale: true, title: true, description: true, content: true, image: true, slug: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    const tCat = pickTranslation(category.translations, locale);
    const transformed = {
      id: category.id,
      slug: (tCat as { slug?: string | null } | undefined)?.slug || category.slug || null,
      baseSlug: category.slug ?? null,
      name: tCat?.name || category.name,
      title: tCat?.title || category.title,
      description: tCat?.description || category.description,
      image: tCat?.image || category.image,
      posts: category.posts.map(p => {
        const tP = pickTranslation(p.translations, locale);
        return {
          id: p.id,
          slug: (tP as { slug?: string | null } | undefined)?.slug || p.slug || null,
          baseSlug: p.slug ?? null,
          title: tP?.title || p.title,
          description: tP?.description || p.description,
          content: tP?.content || p.content,
          image: tP?.image || p.image,
          published: p.published,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }),
      createdAt: category.createdAt,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('[CATEGORY_GET]', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  try {
    const { categoryId: catIdOrSlug } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'blog');
    if (denied) return denied;
    const body = await req.json();

    const existingCat = await prisma.postCategory.findFirst({
      where: whereByIdOrSlug(catIdOrSlug),
      select: { id: true, name: true },
    });
    if (!existingCat) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    const categoryId = existingCat.id;

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.image !== undefined) updateData.image = body.image;

    if (body.slug !== undefined) {
      const cleaned = normalizeUserSlug(body.slug);
      let base = cleaned ?? "";
      if (!base) {
        const newEnName =
          typeof body?.translations?.en?.name === "string"
            ? body.translations.en.name.trim()
            : "";
        if (newEnName) {
          base = newEnName;
        } else {
          const existingEn = await prisma.postCategoryTranslation.findFirst({
            where: { categoryId, locale: "en" },
            select: { name: true },
          });
          base = existingEn?.name?.trim() || body.name || existingCat.name;
        }
      }
      updateData.slug = await generateUniqueSlug(
        prisma.postCategory as any,
        base,
        { fallbackPrefix: "blog-category", currentId: categoryId }
      );
    }

    const translationUpdates: { locale: string; data: any }[] = [];
    if (body.translations && typeof body.translations === 'object') {
      for (const [locale, t] of Object.entries(body.translations)) {
        if (locale !== 'ar' && t && typeof t === 'object') translationUpdates.push({ locale, data: t as any });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const cat = await tx.postCategory.update({ where: { id: categoryId }, data: updateData });

      for (const { locale, data } of translationUpdates) {
        const td: any = {};
        if (data.name !== undefined) td.name = data.name;
        if (data.title !== undefined) td.title = data.title;
        if (data.description !== undefined) td.description = data.description;
        if (data.image !== undefined) td.image = data.image;

        // Per-locale slug. Explicit empty/null clears; non-empty is normalized + deduped.
        // If caller doesn't pass `slug` and there isn't one yet, auto-generate from name.
        const existingTrans = await tx.postCategoryTranslation.findUnique({
          where: { categoryId_locale: { categoryId, locale } },
          select: { id: true, slug: true },
        });
        if (Object.prototype.hasOwnProperty.call(data, "slug")) {
          const userSlug = normalizeUserSlug(data.slug);
          td.slug = userSlug
            ? await generateUniqueLocaleSlug(
                tx.postCategoryTranslation as any,
                userSlug,
                {
                  locale,
                  fallbackPrefix: "blog-category",
                  currentTranslationId: existingTrans?.id,
                }
              )
            : null;
        } else if (!existingTrans?.slug && data.name) {
          td.slug = await generateUniqueLocaleSlug(
            tx.postCategoryTranslation as any,
            data.name,
            {
              locale,
              fallbackPrefix: "blog-category",
              currentTranslationId: existingTrans?.id,
            }
          );
        }

        if (Object.keys(td).length === 0) continue;

        await tx.postCategoryTranslation.upsert({
          where: { categoryId_locale: { categoryId, locale } },
          update: td,
          create: { categoryId, locale, ...td }
        });
      }

      return cat;
    });

    const full = await prisma.postCategory.findUnique({
      where: { id: updated.id },
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
      action: "POST_CATEGORY_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل تصنيف المدونة: ${full?.name ?? categoryId}`,
      entityType: "PostCategory",
      entityId: categoryId,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error('[CATEGORY_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  try {
    const { categoryId: catIdOrSlug } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'blog');
    if (denied) return denied;
    const force = req.nextUrl.searchParams.get('force') === 'true';

    const catMeta = await prisma.postCategory.findFirst({
      where: whereByIdOrSlug(catIdOrSlug),
      select: { id: true, name: true },
    });
    if (!catMeta) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    const categoryId = catMeta.id;

    const postCount = await prisma.post.count({ where: { categoryId } });
    if (postCount > 0 && !force) return NextResponse.json({ error: 'Category has posts. Use force=true to delete.' }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      if (postCount > 0 && force) {
        await tx.post.deleteMany({ where: { categoryId } });
      }
      await tx.postCategoryTranslation.deleteMany({ where: { categoryId } });
      await tx.postCategory.delete({ where: { id: categoryId } });
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "POST_CATEGORY_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف تصنيف المدونة: ${catMeta?.name ?? categoryId}${force ? " (مع المقالات)" : ""}`,
      entityType: "PostCategory",
      entityId: categoryId,
      metadata: { force },
    });

    return NextResponse.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('[CATEGORY_DELETE]', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}