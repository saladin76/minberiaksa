import { NextRequest, NextResponse } from 'next/server';
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
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";

// GET: return a single category (localized) with optional counts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const paramsUrl = request.nextUrl.searchParams;
    const locale = paramsUrl.get('locale') || 'ar';
    const includeCounts = paramsUrl.get('counts') === 'true';
    const allTranslations = paramsUrl.get('allTranslations') === 'true';

    const category = await prisma.category.findFirst({
      // Any locale, not just this one: a locale without its own slug canonically
      // uses the English one, so those URLs must resolve here too. Locale still
      // selects which translation is returned, not which slugs are addressable.
      where: whereByIdOrAnyLocaleSlug(id),
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        image: true,
        icon: true,
        order: true,
        isActive: true,
        translations: allTranslations
          ? { select: { locale: true, name: true, description: true, slug: true } }
          : {
              where: translationLocaleWhere(locale),
              take: 2,
              select: { locale: true, name: true, description: true, slug: true },
            },
        ...(includeCounts ? { _count: { select: { campaigns: true } } } : {})
      }
    });

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const isActive = category.isActive ?? true;

    if (allTranslations) {
      return NextResponse.json({
        ...category,
        isActive,
        campaignCount: (category as any)._count?.campaigns ?? undefined
      });
    }

    const t = pickTranslation(category.translations, locale);
    return NextResponse.json({
      id: category.id,
      slug: (t as { slug?: string | null } | undefined)?.slug || category.slug || null,
      baseSlug: category.slug ?? null,
      name: t?.name || category.name,
      description: t?.description || category.description,
      image: category.image,
      icon: category.icon,
      order: category.order,
      isActive,
      campaignCount: (category as any)._count?.campaigns ?? undefined
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    return NextResponse.json({ error: 'Failed to fetch category' }, { status: 500 });
  }
}

// PUT: admin-only; supports updating base fields and upserting translations.
// Important: this intentionally avoids prisma.$transaction because some MongoDB
// deployments used by the app do not support replica-set transactions.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idOrSlug } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'categories');
    if (denied) return denied;

    const body = await request.json();
    const { name, description, image, icon, order, translations } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const existing = await prisma.category.findFirst({
      where: whereByIdOrSlug(idOrSlug),
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    const id = existing.id;

    let nextSlug: string | undefined;
    if (body.slug !== undefined) {
      const cleaned = normalizeUserSlug(body.slug);
      let base = cleaned ?? '';
      if (!base) {
        const newEnName = typeof body?.translations?.en?.name === 'string' ? body.translations.en.name.trim() : '';
        if (newEnName) {
          base = newEnName;
        } else {
          const existingEn = await prisma.categoryTranslation.findFirst({
            where: { categoryId: id, locale: 'en' },
            select: { name: true },
          });
          base = existingEn?.name?.trim() || name || existing.name;
        }
      }
      nextSlug = await generateUniqueSlug(prisma.category as any, base, { fallbackPrefix: 'category', currentId: id });
    }

    const updatedCat = await prisma.category.update({
      where: { id },
      data: {
        name: String(name).trim(),
        description: description || '',
        image: image || '',
        icon: icon || '',
        order: order ?? 0,
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
      }
    });

    if (translations && typeof translations === 'object') {
      for (const [locale, t] of Object.entries(translations)) {
        if (locale === 'ar') continue;
        if (!t || typeof t !== 'object') continue;
        const tt: any = t;
        const translatedName = typeof tt.name === 'string' ? tt.name.trim() : '';
        const translatedDescription = typeof tt.description === 'string' ? tt.description : '';

        // Empty locale tabs should not overwrite existing translations or break save.
        if (!translatedName && !translatedDescription && !tt.slug) continue;
        if (!translatedName) continue;

        const existingTrans = await prisma.categoryTranslation.findUnique({
          where: { categoryId_locale: { categoryId: id, locale } as any },
          select: { id: true, slug: true },
        });

        const requestedSlug = normalizeUserSlug(tt.slug);
        let localeSlug: string | null = existingTrans?.slug ?? null;
        if (Object.prototype.hasOwnProperty.call(tt, 'slug')) {
          localeSlug = requestedSlug
            ? await generateUniqueLocaleSlug(prisma.categoryTranslation as any, requestedSlug, {
                locale,
                fallbackPrefix: 'category',
                currentTranslationId: existingTrans?.id,
              })
            : null;
        } else if (!existingTrans?.slug && translatedName) {
          localeSlug = await generateUniqueLocaleSlug(prisma.categoryTranslation as any, translatedName, {
            locale,
            fallbackPrefix: 'category',
            currentTranslationId: existingTrans?.id,
          });
        }

        await prisma.categoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: id, locale } as any },
          update: {
            name: translatedName,
            description: translatedDescription,
            slug: localeSlug,
          },
          create: {
            categoryId: id,
            locale,
            name: translatedName,
            description: translatedDescription,
            slug: localeSlug,
          },
        });
      }
    }

    const full = await prisma.category.findUnique({
      where: { id: updatedCat.id },
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

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: 'CATEGORY_UPDATE',
      messageAr: `${actor.actorName ?? 'مسؤول'} عدّل الحملة: ${full?.name ?? name}`,
      entityType: 'Category',
      entityId: id,
    });

    return NextResponse.json(full);
  } catch (error: any) {
    console.error('Error updating category:', error);
    const code = error?.code || '';
    const message = String(error?.message || '');
    if (code === 'P2002' || message.toLowerCase().includes('unique')) {
      return NextResponse.json({ error: 'Category with this name already exists' }, { status: 400 });
    }
    return NextResponse.json(
      { error: message ? `Failed to update category: ${message.slice(0, 180)}` : 'Failed to update category' },
      { status: 500 }
    );
  }
}

// PATCH: admin-only; toggle the category's archive state. When isActive flips,
// cascade the same value to every campaign in the category — archiving the
// category archives every campaign, re-activating brings them all back.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idOrSlug } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'categories');
    if (denied) return denied;

    const body = await request.json();
    if (typeof body?.isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive (boolean) is required' }, { status: 400 });
    }
    const nextActive: boolean = body.isActive;

    const existing = await prisma.category.findFirst({
      where: whereByIdOrSlug(idOrSlug),
      select: { id: true, name: true, isActive: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    const id = existing.id;

    await prisma.category.update({
      where: { id },
      data: { isActive: nextActive },
    });

    // Cascade to every non-deleted member campaign. updateMany on the m2m
    // mirror is safe — categoryIds is just an ObjectId[] on the Campaign side.
    // Soft-deleted campaigns are skipped so re-activating a category doesn't
    // resurrect them.
    const cascade = await prisma.campaign.updateMany({
      where: {
        AND: [
          { categoryIds: { has: id } },
          NOT_SOFT_DELETED,
        ],
      },
      data: { isActive: nextActive },
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: nextActive ? 'CATEGORY_ACTIVATE' : 'CATEGORY_ARCHIVE',
      messageAr: `${actor.actorName ?? 'مسؤول'} ${nextActive ? 'فعّل' : 'أرشف'} الحملة "${existing.name}" (${cascade.count} مشروع تابع)`,
      entityType: 'Category',
      entityId: id,
    });

    return NextResponse.json({
      id,
      isActive: nextActive,
      cascadedCampaigns: cascade.count,
    });
  } catch (error) {
    console.error('Error toggling category isActive:', error);
    return NextResponse.json({ error: 'Failed to update category status' }, { status: 500 });
  }
}

// DELETE: admin-only; refuse to delete if campaigns exist
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idOrSlug } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'categories');
    if (denied) return denied;

    const cat = await prisma.category.findFirst({
      where: whereByIdOrSlug(idOrSlug),
      select: { id: true, name: true },
    });
    if (!cat) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    const id = cat.id;

    const campaignCount = await prisma.campaign.count({ where: { categoryIds: { has: id } } });
    if (campaignCount > 0) {
      return NextResponse.json({ error: 'Category has campaigns. Delete or move campaigns before deleting the category.' }, { status: 400 });
    }

    await prisma.category.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: 'CATEGORY_DELETE',
      messageAr: `${actor.actorName ?? 'مسؤول'} حذف الحملة: ${cat?.name ?? id}`,
      entityType: 'Category',
      entityId: id,
    });

    return NextResponse.json({ message: 'Category deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
