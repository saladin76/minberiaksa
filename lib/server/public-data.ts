import "server-only";
import { prisma } from "@/lib/prisma";
import {
  computeCampaignProgressPercent,
  normalizeFundraisingMode,
  normalizeGoalType,
  parseSuggestedShareCounts,
  showCampaignProgress,
} from "@/lib/campaign/campaign-modes";
import { parseSuggestedDonations } from "@/lib/campaign/suggested-donations";

const CAMPAIGNS_PER_PAGE = 12;
const POSTS_PER_PAGE = 9;

/**
 * Server-side initial fetch for the public campaigns page (default filters).
 * The client-side component re-fetches when the user applies filters.
 */
export async function getInitialCampaignsForPage(locale: string) {
  try {
    // Match the default ordering used by /api/campaigns when sortBy is "newest":
    // global priority first (asc), then most-recent first. Mongo's ascending sort places
    // null FIRST, so we split into two queries — prioritized first, then non-prioritized
    // recency — and merge.
    const includeShape = {
      categories: {
        select: {
          id: true,
          slug: true,
          name: true,
          icon: true,
          translations: { where: { locale }, take: 1 },
        },
      },
      translations: { where: { locale }, take: 1 },
      _count: { select: { donations: true } },
    } as const;

    const [total, priRows] = await Promise.all([
      prisma.campaign.count({ where: { isActive: true } }),
      prisma.campaign.findMany({
        where: { isActive: true, NOT: { priority: null } },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: CAMPAIGNS_PER_PAGE + 1,
        include: includeShape,
      }),
    ]);
    const remaining = Math.max(0, CAMPAIGNS_PER_PAGE + 1 - priRows.length);
    const recentRows = remaining > 0
      ? await prisma.campaign.findMany({
          where: { isActive: true, priority: null },
          orderBy: { createdAt: "desc" },
          take: remaining,
          include: includeShape,
        })
      : [];
    const rows = [...priRows, ...recentRows];

    const hasMore = rows.length > CAMPAIGNS_PER_PAGE;
    const items = hasMore ? rows.slice(0, CAMPAIGNS_PER_PAGE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    const transformed = items.map((c) => {
      const goalType = normalizeGoalType(c.goalType);
      const fundraisingMode = normalizeFundraisingMode(c.fundraisingMode);
      const tC = (c.translations as Array<{
        title?: string;
        description?: string;
        slug?: string | null;
      }>)[0];
      const cats = ((c as any).categories as
        | Array<{
            id: string;
            slug?: string | null;
            name: string;
            icon: string | null;
            translations: Array<{ name?: string; slug?: string | null }>;
          }>
        | undefined) ?? [];
      const localizedCats = cats.map((cat) => {
        const tCat = cat.translations?.[0];
        return {
          id: cat.id,
          slug: tCat?.slug || cat.slug || null,
          name: tCat?.name || cat.name,
          icon: cat.icon,
        };
      });
      return {
        id: c.id,
        // Locale-aware slug: per-locale translation slug → base slug → null.
        slug: tC?.slug || (c as { slug?: string | null }).slug || null,
        baseSlug: (c as { slug?: string | null }).slug ?? null,
        title: tC?.title || c.title,
        description: tC?.description || c.description,
        images: c.images,
        videoUrl: c.videoUrl,
        targetAmount: c.targetAmount,
        currentAmount: c.currentAmount,
        isActive: c.isActive,
        priority: c.priority,
        // Many-to-many: surface all categories plus the first one as the legacy
        // `category` alias for components that haven't migrated yet.
        categoryIds: c.categoryIds ?? localizedCats.map((x) => x.id),
        categories: localizedCats,
        category: localizedCats[0] ?? null,
        donationCount: c._count.donations,
        progress: computeCampaignProgressPercent(
          c.currentAmount,
          c.targetAmount,
          goalType
        ),
        showProgress: showCampaignProgress(goalType),
        goalType,
        fundraisingMode,
        sharePriceUSD: c.sharePriceUSD ?? null,
        suggestedShareCounts: parseSuggestedShareCounts(c.suggestedShareCounts),
        suggestedDonations: parseSuggestedDonations(c.suggestedDonations),
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });

    return { items: transformed, nextCursor, hasMore, total };
  } catch (err) {
    console.error("getInitialCampaignsForPage failed:", err);
    return { items: [], nextCursor: null as string | null, hasMore: false, total: 0 };
  }
}

export async function getCategoriesForPage(locale: string) {
  try {
    const rows = await prisma.category.findMany({
      orderBy: [{ order: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        translations: {
          where: { locale },
          take: 1,
          select: { locale: true, name: true, slug: true },
        },
        _count: { select: { campaigns: { where: { isActive: true } } } },
      },
    });

    return rows.map((c) => {
      const t = c.translations[0];
      return {
        id: c.id,
        slug: t?.slug || c.slug || null,
        baseSlug: c.slug ?? null,
        name: t?.name || c.name,
        icon: c.icon,
        campaignCount: c._count.campaigns,
      };
    });
  } catch (err) {
    console.error("getCategoriesForPage failed:", err);
    return [];
  }
}

/**
 * Server-side initial fetch for the public blog page.
 */
export async function getInitialPostsForPage(locale: string) {
  try {
    const rows = await prisma.post.findMany({
      where: { published: true },
      take: POSTS_PER_PAGE + 1,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        image: true,
        createdAt: true,
        category: {
          select: {
            id: true,
            slug: true,
            name: true,
            translations: {
              where: { locale },
              take: 1,
              select: { name: true, slug: true },
            },
          },
        },
        translations: {
          where: { locale },
          take: 1,
          select: { title: true, description: true, image: true, slug: true },
        },
      },
    });

    const hasMore = rows.length > POSTS_PER_PAGE;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    const transformed = items.map((p) => ({
      id: p.id,
      slug: p.translations[0]?.slug || p.slug || null,
      baseSlug: p.slug ?? null,
      title: p.translations[0]?.title || p.title || "",
      description: p.translations[0]?.description || p.description || "",
      image: p.translations[0]?.image || p.image || null,
      createdAt: p.createdAt.toISOString(),
      category: p.category
        ? {
            id: p.category.id,
            slug:
              p.category.translations[0]?.slug || p.category.slug || null,
            name: p.category.translations[0]?.name || p.category.name,
          }
        : null,
    }));

    return { items: transformed, nextCursor, hasMore };
  } catch (err) {
    console.error("getInitialPostsForPage failed:", err);
    return { items: [], nextCursor: null as string | null, hasMore: false };
  }
}
