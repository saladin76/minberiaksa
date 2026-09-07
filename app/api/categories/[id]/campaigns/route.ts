import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeCampaignProgressPercent,
  normalizeFundraisingMode,
  normalizeGoalType,
  parseSuggestedShareCounts,
  showCampaignProgress,
} from "@/lib/campaign/campaign-modes";
import { parseSuggestedDonations } from "@/lib/campaign/suggested-donations";
import { parseShareLabels } from "@/lib/campaign/share-labels";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { whereByIdOrAnyLocaleSlug } from "@/lib/slug";
import { parseCategoryPriorities, getCategoryPriority } from "@/lib/campaign/categories";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idOrSlug } = await params;
    if (!idOrSlug || idOrSlug === 'undefined') {
      return NextResponse.json({ error: 'Category ID required' }, { status: 400 });
    }
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get('cursor'); // Last item's ID from previous batch
    const limit = Math.min(Number(searchParams.get('limit')) || 10, 100); // cap for safety
    const page = Math.max(1, Math.floor(Number(searchParams.get('page')) || 1));
    const usePagePagination = searchParams.has('page');
    const offset = (page - 1) * limit;
    const locale = searchParams.get('locale') || 'ar';

    // Filters
    const search = searchParams.get('search')?.toLowerCase();
    const sortBy = searchParams.get('sortBy') || 'newest';
    const minAmount = Number(searchParams.get('minAmount')) || 0;
    const maxAmount = Number(searchParams.get('maxAmount')) || Infinity;
    const includeInactive =
      searchParams.get('includeInactive') === 'true' ||
      searchParams.get('isActiveFalse') === 'true' ||
      searchParams.get('isActive') === 'false';
    const activeOnly = !includeInactive;
    const hasPriority = searchParams.get('hasPriority') === 'true';

    // Check that category exists and fetch localized name if available. Resolves the
    // param against the category's base slug or any per-locale translation slug.
    const category = await prisma.category.findFirst({
      // Any locale, not just this one: a locale without its own slug canonically
      // uses the English one, so those URLs must resolve here too. Locale still
      // selects which translation is returned, not which slugs are addressable.
      where: whereByIdOrAnyLocaleSlug(idOrSlug),
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, name: true, slug: true } }
      }
    });

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    const id = category.id;

    const isDefaultAmountRange = minAmount <= 0 && maxAmount === Infinity;
    const amountConditions = isDefaultAmountRange
      ? []
      : [
          { targetAmount: { gte: minAmount } },
          maxAmount < Infinity ? { targetAmount: { lte: maxAmount } } : {},
        ];

    // Build where clause. The category relation is now many-to-many, so we
    // filter by `categoryIds` containing the category we're listing.
    const where: any = {
      categoryIds: { has: id },
      AND: [
        ...amountConditions,
        activeOnly ? { isActive: true } : {},
        NOT_SOFT_DELETED,
        hasPriority ? { NOT: { priority: null } } : {}
      ].filter(Boolean)
    };

    // If search is provided, add conditions that check both base and translated fields
    if (search) {
      where.AND.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { translations: { some: { locale, title: { contains: search, mode: 'insensitive' } } } },
          { translations: { some: { locale, description: { contains: search, mode: 'insensitive' } } } }
        ]
      });
    }

    const selectShape = {
      id: true,
      slug: true,
      title: true,
      description: true,
      images: true,
      videoUrl: true,
      targetAmount: true,
      currentAmount: true,
      isActive: true,
      priority: true,
      // Per-category priorities now live in this JSON map ({ [categoryId]: order }).
      // Mongo can't sort directly by JSON values, so we always sort in-memory below.
      categoryPriorities: true,
      categoryIds: true,
      createdAt: true,
      updatedAt: true,
      goalType: true,
      fundraisingMode: true,
      sharePriceUSD: true,
      suggestedShareCounts: true,
      shareLabels: true,
      suggestedDonations: true,
      translations: { where: translationLocaleWhere(locale), take: 2, select: { title: true, description: true, locale: true, slug: true } },
      _count: { select: { donations: true } },
      categories: {
        select: {
          id: true,
          slug: true,
          name: true,
          icon: true,
          translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, name: true, slug: true } },
        },
      },
    } satisfies Prisma.CampaignSelect;

    const total = await prisma.campaign.count({ where });

    // Fetch + sort in-memory. We can't push the per-category priority into Mongo's
    // sort because it's keyed inside a JSON object. To keep correctness on large
    // categories we cap the fetch at MAX_IN_MEMORY rows; if a category grows past
    // that we'll need a proper paginated query, but that's a future problem.
    const MAX_IN_MEMORY = 1000;
    const applyPriorityFallbackSort = sortBy === 'newest' || !sortBy || sortBy === 'priority';
    const allInCategory = await prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_IN_MEMORY,
      select: selectShape,
    });

    const sortedAll = [...allInCategory].sort((a, b) => {
      if (sortBy === 'amount-high') return Number(b.targetAmount) - Number(a.targetAmount);
      if (sortBy === 'amount-low') return Number(a.targetAmount) - Number(b.targetAmount);
      if (sortBy === 'progress') {
        const ga = normalizeGoalType(a.goalType);
        const gb = normalizeGoalType(b.goalType);
        const pa = computeCampaignProgressPercent(a.currentAmount, a.targetAmount, ga) / 100;
        const pb = computeCampaignProgressPercent(b.currentAmount, b.targetAmount, gb) / 100;
        return pb - pa;
      }
      if (!applyPriorityFallbackSort) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      // Default: per-category priority asc → global priority asc → createdAt desc.
      // null/missing priorities are treated as "after" any explicit value.
      const aCat = getCategoryPriority(a.categoryPriorities, id);
      const bCat = getCategoryPriority(b.categoryPriorities, id);
      if (aCat != null && bCat != null && aCat !== bCat) return aCat - bCat;
      if (aCat != null && bCat == null) return -1;
      if (aCat == null && bCat != null) return 1;
      const ap = a.priority ?? null;
      const bp = b.priority ?? null;
      if (ap != null && bp != null && ap !== bp) return ap - bp;
      if (ap != null && bp == null) return -1;
      if (ap == null && bp != null) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Slice the sorted list according to the requested pagination flavor.
    let pageItems: Prisma.CampaignGetPayload<{ select: typeof selectShape }>[];
    let hasMore: boolean;
    let nextCursor: string | null = null;

    if (usePagePagination) {
      const slice = sortedAll.slice(offset, offset + limit + 1);
      hasMore = slice.length > limit;
      pageItems = hasMore ? slice.slice(0, -1) : slice;
    } else if (cursor) {
      const cursorIdx = sortedAll.findIndex((c) => c.id === cursor);
      const start = cursorIdx >= 0 ? cursorIdx + 1 : 0;
      const slice = sortedAll.slice(start, start + limit + 1);
      hasMore = slice.length > limit;
      pageItems = hasMore ? slice.slice(0, -1) : slice;
      nextCursor = hasMore && pageItems.length > 0 ? pageItems[pageItems.length - 1].id : null;
    } else {
      const slice = sortedAll.slice(0, limit + 1);
      hasMore = slice.length > limit;
      pageItems = hasMore ? slice.slice(0, -1) : slice;
      nextCursor = hasMore && pageItems.length > 0 ? pageItems[pageItems.length - 1].id : null;
    }

    const transformed = pageItems.map((c) => {
      const goalType = normalizeGoalType(c.goalType);
      const fundraisingMode = normalizeFundraisingMode(c.fundraisingMode);
      const tC = pickTranslation(c.translations, locale);
      const localizedCats = (c.categories ?? []).map((cat) => {
        const tCat = pickTranslation(cat.translations, locale);
        return {
          id: cat.id,
          slug:
            (tCat as { slug?: string | null } | undefined)?.slug ||
            cat.slug ||
            null,
          name: tCat?.name || cat.name,
          icon: cat.icon,
        };
      });
      // Prefer the page's own category for the legacy single-category fields so
      // breadcrumbs/labels render the category the donor is browsing.
      const primary = localizedCats.find((x) => x.id === id) ?? localizedCats[0] ?? null;
      return {
        id: c.id,
        // Locale-aware slug: per-locale translation slug → base slug → null.
        // Drives /campaign/[slug] links from this list.
        slug: (tC as { slug?: string | null } | undefined)?.slug || c.slug || null,
        baseSlug: c.slug ?? null,
        title: tC?.title || c.title,
        description: tC?.description || c.description,
        images: c.images,
        videoUrl: c.videoUrl,
        targetAmount: c.targetAmount,
        currentAmount: c.currentAmount,
        isActive: c.isActive,
        categoryId: primary?.id ?? id,
        categoryIds: c.categoryIds ?? [],
        // categoryPriority surfaces only the value for THIS category page —
        // a campaign in many categories may have a different rank in each.
        categoryPriority: getCategoryPriority(c.categoryPriorities, id),
        categoryPriorities: parseCategoryPriorities(c.categoryPriorities),
        priority: c.priority,
        donationCount: c._count?.donations ?? 0,
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
        shareLabels: parseShareLabels(c.shareLabels),
        suggestedDonations: parseSuggestedDonations(c.suggestedDonations),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        categories: localizedCats,
        category: primary,
      };
    });

    // Localized category response — surface the per-locale slug for canonical URLs
    const tCatPicked = pickTranslation(category.translations, locale);
    const localizedCategory = {
      id: category.id,
      slug:
        (tCatPicked as { slug?: string | null } | undefined)?.slug ||
        category.slug ||
        null,
      baseSlug: category.slug ?? null,
      name: tCatPicked?.name || category.name,
      icon: category.icon,
    };

    return NextResponse.json({
      items: transformed,
      nextCursor,
      nextPage: hasMore ? page + 1 : null,
      hasMore,
      total,
      category: localizedCategory,
      filters: { search, sortBy, minAmount, maxAmount, activeOnly, hasPriority, locale }
    });
  } catch (error) {
    console.error('Error fetching category campaigns:', error);
    return NextResponse.json({ error: 'Failed to fetch category campaigns' }, { status: 500 });
  }
}
