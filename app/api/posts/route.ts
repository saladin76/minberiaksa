import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/options";
import { orderCampaignsByIds, sanitizeCampaignIds } from "@/lib/blog/campaign-ids";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import {
  generateUniqueSlug,
  generateUniqueLocaleSlug,
  normalizeUserSlug,
} from "@/lib/slug";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// GET: list posts with locale-aware translations, search, and paging
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const cursor = params.get('cursor');
    const limit = Math.min(Number(params.get('limit')) || 50, 1000);
    const locale = params.get('locale') || 'ar';
    const search = params.get('search')?.toLowerCase();

    const posts = await prisma.post.findMany({
      take: limit + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      orderBy: { createdAt: 'desc' },
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
            translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, name: true, slug: true } }
          }
        },
        translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true, content: true, image: true, slug: true } },
        campaignIds: true,
      }
    });

    let filtered = posts;
    if (search) {
      filtered = posts.filter(p => {
        const t = pickTranslation(p.translations, locale);
        const title = t?.title || p.title || '';
        const desc = t?.description || p.description || '';
        return title.toLowerCase().includes(search) || desc.toLowerCase().includes(search);
      });
    }

    const hasMore = filtered.length > limit;
    const items = hasMore ? filtered.slice(0, -1) : filtered;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    const allCampaignIds = [...new Set(items.flatMap((p) => p.campaignIds ?? []))];
    const campaignRows =
      allCampaignIds.length === 0
        ? []
        : await prisma.campaign.findMany({
            where: { id: { in: allCampaignIds } },
            select: {
              id: true,
              slug: true,
              title: true,
              currentAmount: true,
              targetAmount: true,
              images: true,
              translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, slug: true } },
            },
          });

    const transformed = items.map((p) => {
      const ids = p.campaignIds ?? [];
      const campaigns = orderCampaignsByIds(ids, campaignRows).map((c) => {
        const tC = pickTranslation(c.translations, locale);
        return {
          id: c.id,
          // Locale-aware slug for /campaign/[slug] links from blog cards.
          slug: (tC as { slug?: string | null } | undefined)?.slug || c.slug || null,
          baseSlug: c.slug ?? null,
          title: tC?.title || c.title,
          currentAmount: c.currentAmount,
          targetAmount: c.targetAmount,
          images: c.images,
        };
      });
      const tP = pickTranslation(p.translations, locale);
      const tCat = pickTranslation(p.category?.translations, locale);
      return {
        id: p.id,
        slug: (tP as { slug?: string | null } | undefined)?.slug || p.slug || null,
        baseSlug: p.slug ?? null,
        title: tP?.title || p.title,
        description: tP?.description || p.description,
        content: tP?.content || p.content,
        image: tP?.image || p.image,
        published: p.published,
        category: p.category
          ? {
              id: p.category.id,
              slug:
                (tCat as { slug?: string | null } | undefined)?.slug ||
                p.category.slug ||
                null,
              name: tCat?.name || p.category.name,
            }
          : null,
        campaigns,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    return NextResponse.json({ items: transformed, nextCursor, hasMore, filters: { locale, limit, search } });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

// POST: create a new post (admin-only) and optionally create translations
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "blog");
    if (denied) return denied;

    const data = await request.json();
    const { title, description, content, image, published, categoryId, campaignIds, campaignId, translations } = data;
    const resolvedCampaignIds = sanitizeCampaignIds(
      campaignIds !== undefined ? campaignIds : campaignId != null ? [campaignId] : []
    );

    // English is required.
    const enTrans = translations?.en;
    const enTitle: string | undefined =
      typeof enTrans?.title === "string" ? enTrans.title.trim() : undefined;
    const enDescription: string | undefined =
      typeof enTrans?.description === "string" ? enTrans.description.trim() : undefined;
    if (!enTitle || !enDescription) {
      return NextResponse.json(
        { error: "English title and description are required" },
        { status: 400 }
      );
    }

    const translationData: {
      locale: string;
      title?: string;
      description?: string;
      content?: string;
      image?: string;
      requestedSlug: string | null;
    }[] = [];
    if (translations && typeof translations === 'object') {
      for (const [locale, t] of Object.entries(translations)) {
        if (locale !== 'ar' && t && typeof t === 'object') {
          const tt: any = t;
          translationData.push({
            locale,
            title: tt.title,
            description: tt.description,
            content: tt.content,
            image: tt.image,
            requestedSlug: normalizeUserSlug(tt.slug),
          });
        }
      }
    }

    // Auto-generate slug from English title (always); admin can override.
    const requestedSlug = normalizeUserSlug(data.slug);
    const slug = await generateUniqueSlug(
      prisma.post as any,
      requestedSlug ?? enTitle,
      { fallbackPrefix: "post" }
    );

    const created = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          title: title || "",
          description: description || "",
          content: content || "",
          image: image || "",
          slug,
          published: !!published,
          categoryId: categoryId || null,
          campaignIds: resolvedCampaignIds,
        },
      });

      // Sequential creates so the per-locale slug uniqueness check observes prior writes.
      for (const t of translationData) {
        const localeSlug = await generateUniqueLocaleSlug(
          tx.postTranslation as any,
          t.requestedSlug ?? t.title ?? "",
          { locale: t.locale, fallbackPrefix: "post" }
        );
        await tx.postTranslation.create({
          data: {
            postId: post.id,
            locale: t.locale,
            title: t.title || '',
            description: t.description || '',
            content: t.content || '',
            image: t.image || '',
            slug: localeSlug,
          },
        });
      }

      return post;
    });

    const full = await prisma.post.findUnique({
      where: { id: created.id },
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
      action: "POST_CREATE",
      messageAr: `${actor.name ?? "مسؤول"} أنشأ مقالًا في المدونة: ${(full?.title ?? title) || "(بدون عنوان)"}`,
      entityType: "Post",
      entityId: created.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
