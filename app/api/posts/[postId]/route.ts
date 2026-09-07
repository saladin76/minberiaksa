import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/options";
import { orderCampaignsByIds, sanitizeCampaignIds } from "@/lib/blog/campaign-ids";
import {
  computeCampaignProgressPercent,
  normalizeFundraisingMode,
  normalizeGoalType,
  parseSuggestedShareCounts,
  showCampaignProgress,
} from "@/lib/campaign/campaign-modes";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import {
  generateUniqueSlug,
  generateUniqueLocaleSlug,
  normalizeUserSlug,
  whereByIdOrAnyLocaleSlug,
  whereByIdOrSlug,
  whereByIdOrLocaleSlug,
} from "@/lib/slug";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId: postIdOrSlug } = await params;
    const url = new URL(req.url);
    const qp = url.searchParams;
    const locale = req.headers.get('x-locale') || qp.get('locale') || qp.get('lang') || 'ar';

    const post = await prisma.post.findFirst({
      // Any locale, not just this one: a locale without its own slug canonically
      // uses the English one, so those URLs must resolve here too. Locale still
      // selects which translation is returned, not which slugs are addressable.
      where: whereByIdOrAnyLocaleSlug(postIdOrSlug),
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
        category: {
          select: {
            id: true,
            slug: true,
            name: true,
            translations: {
              where: translationLocaleWhere(locale),
              take: 2,
              select: { locale: true, name: true, slug: true },
            },
          },
        },
        campaignIds: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: {
            title: true,
            description: true,
            content: true,
            image: true,
            locale: true,
            slug: true,
          },
        },
      },
    });

    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    const postId = post.id;

    const campaignIdList = post.campaignIds ?? [];
    const campaignRows =
      campaignIdList.length === 0
        ? []
        : await prisma.campaign.findMany({
            where: { id: { in: campaignIdList } },
            select: {
              id: true,
              slug: true,
              title: true,
              description: true,
              targetAmount: true,
              currentAmount: true,
              images: true,
              isActive: true,
              goalType: true,
              fundraisingMode: true,
              sharePriceUSD: true,
              suggestedShareCounts: true,
              translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true, slug: true } },
            },
          });
    const orderedCampaigns = orderCampaignsByIds(campaignIdList, campaignRows).map((c) => {
      const goalType = normalizeGoalType(c.goalType);
      const tC = pickTranslation(c.translations, locale);
      return {
        id: c.id,
        // Locale-aware slug for the related-campaign card shown on single blog post pages.
        slug: (tC as { slug?: string | null } | undefined)?.slug || c.slug || null,
        baseSlug: c.slug ?? null,
        title: tC?.title || c.title,
        description: tC?.description || c.description,
        targetAmount: c.targetAmount,
        currentAmount: c.currentAmount,
        images: c.images,
        isActive: c.isActive,
        goalType,
        fundraisingMode: normalizeFundraisingMode(c.fundraisingMode),
        sharePriceUSD: c.sharePriceUSD ?? null,
        suggestedShareCounts: parseSuggestedShareCounts(c.suggestedShareCounts),
        showProgress: showCampaignProgress(goalType),
        progress: computeCampaignProgressPercent(
          c.currentAmount,
          c.targetAmount,
          goalType
        ),
      };
    });

    // Find similar posts in the same category (only published)
    let similar = await prisma.post.findMany({
      where: { categoryId: post.category?.id, id: { not: postId }, published: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
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
        translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true, content: true, image: true, slug: true } }
      }
    });

    // If no similar posts in the category, fall back to latest published posts (excluding current)
    if (!similar || similar.length === 0) {
      similar = await prisma.post.findMany({
        where: { published: true, id: { not: postId } },
        orderBy: { createdAt: 'desc' },
        take: 3,
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
          translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true, content: true, image: true, slug: true } }
        }
      });
    }

    const tPost = pickTranslation(post.translations, locale);
    const tPostCat = pickTranslation(post.category?.translations, locale);

    const filteredPost = {
      id: post.id,
      // Locale-aware slug: per-locale → base → null. baseSlug exposed for hreflang/sitemap.
      slug: (tPost as { slug?: string | null } | undefined)?.slug || post.slug || null,
      baseSlug: post.slug ?? null,
      title: tPost?.title || post.title,
      description: tPost?.description || post.description,
      content: tPost?.content || post.content,
      image: tPost?.image || post.image,
      published: post.published,
      category: post.category
        ? {
            id: post.category.id,
            slug:
              (tPostCat as { slug?: string | null } | undefined)?.slug ||
              post.category.slug ||
              null,
            name: tPostCat?.name || post.category.name,
          }
        : null,
      campaigns: orderedCampaigns,
      /** @deprecated use campaigns[0] */
      campaign: orderedCampaigns[0] ?? null,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };

    const filteredSimilar = similar.map(sp => {
      const tSp = pickTranslation(sp.translations, locale);
      return {
        id: sp.id,
        slug: (tSp as { slug?: string | null } | undefined)?.slug || sp.slug || null,
        baseSlug: sp.slug ?? null,
        title: tSp?.title || sp.title,
        description: tSp?.description || sp.description,
        content: tSp?.content || sp.content,
        image: tSp?.image || sp.image,
        published: sp.published,
        createdAt: sp.createdAt,
        updatedAt: sp.updatedAt,
      };
    });

    return NextResponse.json({ post: filteredPost, similarPosts: filteredSimilar });
  } catch (error) {
    console.error('[POST_GET]', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

// PATCH: update post main fields and upsert translations
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "blog");
    if (denied) return denied;

    const { postId: postIdOrSlug } = await params;
    const body = await req.json();

    const existingPost = await prisma.post.findFirst({
      where: whereByIdOrLocaleSlug(postIdOrSlug, "ar"),
      select: { id: true, title: true },
    });
    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const postId = existingPost.id;

    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.image !== undefined) updateData.image = body.image;
    if (body.published !== undefined) updateData.published = body.published;
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
    if (body.campaignIds !== undefined) {
      updateData.campaignIds = sanitizeCampaignIds(body.campaignIds);
    } else if (body.campaignId !== undefined) {
      updateData.campaignIds = sanitizeCampaignIds(
        body.campaignId === "" || body.campaignId == null ? [] : [body.campaignId]
      );
    }

    // Slug: explicit value (admin override) or auto-regenerate from English title
    if (body.slug !== undefined) {
      const cleaned = normalizeUserSlug(body.slug);
      let base = cleaned ?? "";
      if (!base) {
        const newEnTitle =
          typeof body?.translations?.en?.title === "string"
            ? body.translations.en.title.trim()
            : "";
        if (newEnTitle) {
          base = newEnTitle;
        } else {
          const existingEn = await prisma.postTranslation.findFirst({
            where: { postId, locale: "en" },
            select: { title: true },
          });
          base = existingEn?.title?.trim() || existingPost.title || "";
        }
      }
      updateData.slug = await generateUniqueSlug(prisma.post as any, base, {
        fallbackPrefix: "post",
        currentId: postId,
      });
    }

    const translationUpdates: { locale: string; data: any }[] = [];
    if (body.translations && typeof body.translations === 'object') {
      for (const [locale, t] of Object.entries(body.translations)) {
        if (locale !== 'ar' && t && typeof t === 'object') {
          translationUpdates.push({ locale, data: t as any });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const post = await tx.post.update({ where: { id: postId }, data: updateData });

      for (const { locale, data } of translationUpdates) {
        const td: any = {};
        if (data.title !== undefined) td.title = data.title;
        if (data.description !== undefined) td.description = data.description;
        if (data.content !== undefined) td.content = data.content;
        if (data.image !== undefined) td.image = data.image;

        // Per-locale slug. Explicit empty/null clears; non-empty is normalized + deduped.
        // If caller doesn't pass `slug` and there isn't one yet, auto-generate from the
        // translated title so admins get clean URLs without manual work.
        const existingTrans = await tx.postTranslation.findUnique({
          where: { postId_locale: { postId, locale } },
          select: { id: true, slug: true },
        });
        if (Object.prototype.hasOwnProperty.call(data, "slug")) {
          const userSlug = normalizeUserSlug((data as Record<string, unknown>).slug);
          td.slug = userSlug
            ? await generateUniqueLocaleSlug(tx.postTranslation as any, userSlug, {
                locale,
                fallbackPrefix: "post",
                currentTranslationId: existingTrans?.id,
              })
            : null;
        } else if (!existingTrans?.slug && data.title) {
          td.slug = await generateUniqueLocaleSlug(
            tx.postTranslation as any,
            data.title,
            {
              locale,
              fallbackPrefix: "post",
              currentTranslationId: existingTrans?.id,
            }
          );
        }

        if (Object.keys(td).length === 0) continue;

        await tx.postTranslation.upsert({
          where: { postId_locale: { postId, locale } },
          update: td,
          create: { postId, locale, ...td }
        });
      }

      return post;
    });

    const full = await prisma.post.findUnique({
      where: { id: updated.id },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        content: true,
        image: true,
        published: true,
        categoryId: true,
        campaignIds: true,
        translations: { select: { locale: true, title: true, description: true, content: true, image: true, slug: true } },
      },
    });

    const actor = session!.user;
    await writeAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? "ADMIN",
      action: "POST_UPDATE",
      messageAr: `${actor.name ?? "مسؤول"} عدّل مقالًا: ${full?.title ?? body.title ?? postId}`,
      entityType: "Post",
      entityId: postId,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error('[POST_UPDATE]', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

// DELETE: admin-only delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "blog");
    if (denied) return denied;

    const { postId: postIdOrSlug } = await params;

    const exists = await prisma.post.findFirst({
      where: whereByIdOrSlug(postIdOrSlug),
      select: { id: true, title: true },
    });
    if (!exists) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    const postId = exists.id;

    await prisma.$transaction(async (tx) => {
      await tx.postTranslation.deleteMany({ where: { postId } });
      await tx.post.delete({ where: { id: postId } });
    });

    const actor = session!.user;
    await writeAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? "ADMIN",
      action: "POST_DELETE",
      messageAr: `${actor.name ?? "مسؤول"} حذف مقالًا: ${exists.title}`,
      entityType: "Post",
      entityId: postId,
    });

    return NextResponse.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('[POST_DELETE]', error);
    return NextResponse.json({ error: 'Error deleting post' }, { status: 500 });
  }
}