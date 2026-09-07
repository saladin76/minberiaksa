import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/options";
import { parseSuggestedDonations } from "@/lib/campaign/suggested-donations";
import { parseSuggestedTeamSupport } from "@/lib/campaign/suggested-team-support";
import { parseShareLabels } from "@/lib/campaign/share-labels";
import {
  computeCampaignProgressPercent,
  normalizeFundraisingMode,
  normalizeGoalType,
  parseSuggestedShareCounts,
  showCampaignProgress,
} from "@/lib/campaign/campaign-modes";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import { parseIncludeInactive } from "@/lib/campaign/include-inactive-query";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { parseCategoryPriorities } from "@/lib/campaign/categories";
import {
  CampaignCreateValidationError,
} from "@/lib/campaign/admin-create-core";
import {
  createAdminCampaign,
  parseAdminCampaignCreatePayload,
} from "@/lib/campaign/admin-create";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 12, 1), 100);
    const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
    const usePagePagination = searchParams.has("page");
    const offset = (page - 1) * limit;
    const locale = searchParams.get("locale") || "ar";
    const search = searchParams.get("search")?.toLowerCase();
    const sortBy = searchParams.get("sortBy") || "newest";
    const minAmount = Number(searchParams.get("minAmount")) || 0;
    const maxAmount = Number(searchParams.get("maxAmount")) || Infinity;
    const includeInactive = parseIncludeInactive(searchParams);
    const hasPriority = searchParams.get("hasPriority") === "true";

    const isDefaultAmountRange = minAmount <= 0 && maxAmount === Infinity;
    const amountConditions = isDefaultAmountRange
      ? []
      : [
          { targetAmount: { gte: minAmount } },
          maxAmount < Infinity ? { targetAmount: { lte: maxAmount } } : {},
        ];

    const where: any = {
      AND: [
        ...amountConditions,
        includeInactive ? {} : { isActive: true },
        NOT_SOFT_DELETED,
        hasPriority ? { NOT: { priority: null } } : {},
      ].filter((condition) => Object.keys(condition).length > 0),
    };

    if (search) {
      where.AND.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          {
            translations: {
              some: { locale, title: { contains: search, mode: "insensitive" } },
            },
          },
          {
            translations: {
              some: {
                locale,
                description: { contains: search, mode: "insensitive" },
              },
            },
          },
        ],
      });
    }

    let orderBy: any = { createdAt: "desc" };
    const applyPriorityFallbackSort =
      sortBy === "newest" || !sortBy || sortBy === "priority";
    switch (sortBy) {
      case "amount-high":
        orderBy = { targetAmount: "desc" };
        break;
      case "amount-low":
        orderBy = { targetAmount: "asc" };
        break;
      case "progress":
        orderBy = { currentAmount: "desc" };
        break;
    }

    // IMPORTANT: Do not include the new m2m `categories` relation here yet.
    // Older campaign documents may not have `categoryIds`, and Prisma/Mongo can throw
    // while hydrating required relation fields. Public project loading must be resilient;
    // category backfill can run separately without taking the storefront down.
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
      categoryPriorities: true,
      suggestedDonations: true,
      suggestedTeamSupport: true,
      goalType: true,
      fundraisingMode: true,
      sharePriceUSD: true,
      suggestedShareCounts: true,
      shareLabels: true,
      createdAt: true,
      updatedAt: true,
      translations: {
        where: translationLocaleWhere(locale),
        take: 2,
      },
      _count: { select: { donations: true } },
    } satisfies Prisma.CampaignSelect;

    const total = await prisma.campaign.count({ where });

    const campaigns = await (async () => {
      if (usePagePagination && applyPriorityFallbackSort) {
        const priorityWhere = { ...where, NOT: { priority: null } };
        const recentWhere = { ...where, priority: null };
        const priorityCount = await prisma.campaign.count({ where: priorityWhere });
        const rows: Prisma.CampaignGetPayload<{ select: typeof selectShape }>[] = [];
        let remaining = limit + 1;
        if (offset < priorityCount) {
          const priRows = await prisma.campaign.findMany({
            where: priorityWhere,
            orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
            skip: offset,
            take: remaining,
            select: selectShape,
          });
          rows.push(...priRows);
          remaining -= priRows.length;
        }
        if (remaining > 0) {
          const recentRows = await prisma.campaign.findMany({
            where: recentWhere,
            orderBy: { createdAt: "desc" },
            skip: Math.max(0, offset - priorityCount),
            take: remaining,
            select: selectShape,
          });
          rows.push(...recentRows);
        }
        return rows;
      }

      if (usePagePagination) {
        return prisma.campaign.findMany({
          where,
          skip: offset,
          take: limit + 1,
          orderBy,
          select: selectShape,
        });
      }

      if (applyPriorityFallbackSort && !cursor) {
        const priRows = await prisma.campaign.findMany({
          where: { ...where, NOT: { priority: null } },
          orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
          take: limit + 1,
          select: selectShape,
        });
        const remaining = Math.max(0, limit + 1 - priRows.length);
        const recentRows =
          remaining > 0
            ? await prisma.campaign.findMany({
                where: { ...where, priority: null },
                orderBy: { createdAt: "desc" },
                take: remaining,
                select: selectShape,
              })
            : [];
        return [...priRows, ...recentRows];
      }

      if (applyPriorityFallbackSort && cursor) {
        const cursorRow = await prisma.campaign.findUnique({
          where: { id: cursor },
          select: { priority: true },
        });
        if (cursorRow?.priority != null) {
          const priRows = await prisma.campaign.findMany({
            where: { ...where, NOT: { priority: null } },
            take: limit + 1,
            skip: 1,
            cursor: { id: cursor },
            orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
            select: selectShape,
          });
          const remaining = Math.max(0, limit + 1 - priRows.length);
          const recentRows =
            remaining > 0
              ? await prisma.campaign.findMany({
                  where: { ...where, priority: null },
                  orderBy: { createdAt: "desc" },
                  take: remaining,
                  select: selectShape,
                })
              : [];
          return [...priRows, ...recentRows];
        }
        return prisma.campaign.findMany({
          where: { ...where, priority: null },
          take: limit + 1,
          skip: 1,
          cursor: { id: cursor },
          orderBy: { createdAt: "desc" },
          select: selectShape,
        });
      }

      return prisma.campaign.findMany({
        where,
        take: limit + 1,
        ...(cursor && { skip: 1, cursor: { id: cursor } }),
        orderBy,
        select: selectShape,
      });
    })();

    const sortedCampaigns = [...campaigns];
    if (sortBy === "progress") {
      sortedCampaigns.sort((a, b) => {
        const ga = normalizeGoalType(a.goalType);
        const gb = normalizeGoalType(b.goalType);
        const progressA =
          computeCampaignProgressPercent(a.currentAmount, a.targetAmount, ga) / 100;
        const progressB =
          computeCampaignProgressPercent(b.currentAmount, b.targetAmount, gb) / 100;
        return progressB - progressA;
      });
    }

    const hasMore = sortedCampaigns.length > limit;
    const items = hasMore ? sortedCampaigns.slice(0, -1) : sortedCampaigns;
    const nextCursor = hasMore
      ? sortedCampaigns[sortedCampaigns.length - 2].id
      : null;

    const transformedCampaigns = items.map((campaign) => {
      const goalType = normalizeGoalType(campaign.goalType);
      const fundraisingMode = normalizeFundraisingMode(campaign.fundraisingMode);
      const tC = pickTranslation(campaign.translations, locale);
      const categories: Array<{
        id: string;
        slug: string | null;
        name: string;
        icon: string | null;
      }> = [];
      return {
        id: campaign.id,
        slug:
          (tC as { slug?: string | null } | undefined)?.slug ||
          campaign.slug ||
          null,
        baseSlug: campaign.slug ?? null,
        title: tC?.title || campaign.title,
        description: tC?.description || campaign.description,
        images:
          tC?.image && Array.isArray(campaign.images)
            ? [tC.image, ...campaign.images.slice(1)]
            : campaign.images,
        videoUrl: tC?.videoUrl || campaign.videoUrl,
        targetAmount: campaign.targetAmount,
        currentAmount: campaign.currentAmount,
        isActive: campaign.isActive,
        priority: campaign.priority,
        categories,
        category: null,
        categoryIds: [],
        categoryPriorities: parseCategoryPriorities(campaign.categoryPriorities),
        donationCount: campaign._count.donations,
        progress: computeCampaignProgressPercent(
          campaign.currentAmount,
          campaign.targetAmount,
          goalType,
        ),
        showProgress: showCampaignProgress(goalType),
        goalType,
        fundraisingMode,
        sharePriceUSD: campaign.sharePriceUSD ?? null,
        suggestedShareCounts: parseSuggestedShareCounts(
          campaign.suggestedShareCounts,
        ),
        shareLabels: parseShareLabels(campaign.shareLabels),
        suggestedDonations: parseSuggestedDonations(campaign.suggestedDonations),
        suggestedTeamSupport: parseSuggestedTeamSupport(
          campaign.suggestedTeamSupport,
        ),
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      };
    });

    return NextResponse.json({
      items: transformedCampaigns,
      nextCursor,
      nextPage: hasMore ? page + 1 : null,
      hasMore,
      total,
      filters: {
        search,
        sortBy,
        minAmount,
        maxAmount,
        includeInactive,
        hasPriority,
        locale,
      },
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    const body = await request.json();
    const input = parseAdminCampaignCreatePayload(body);
    const created = await createAdminCampaign(input);

    const actor = session!.user;
    const createdRecord = created as { id?: string; title?: string } | null;
    queueAuditLog({
      stream: "TEAM",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ?? "ADMIN",
      action: "CAMPAIGN_CREATED",
      messageAr: `تم إنشاء مشروع: ${createdRecord?.title ?? input.title}`,
      messageEn: `${actor.name ?? "Admin"} created campaign ${createdRecord?.title ?? input.title}`,
      entityType: "Campaign",
      entityId: createdRecord?.id,
    });

    return NextResponse.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CampaignCreateValidationError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: error.status },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    console.error("Error creating campaign:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء المشروع") },
      { status: 500 },
    );
  }
}
