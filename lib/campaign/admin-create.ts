import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createCampaignCreator,
  parseCampaignCreatePayload,
  type CampaignCreateTransaction,
  type CampaignPersistenceData,
  type CampaignTranslationPersistenceData,
  type ParsedCampaignCreatePayload,
} from "./admin-create-core";
import { parseSuggestedDonations } from "./suggested-donations";
import { parseSuggestedTeamSupport } from "./suggested-team-support";
import { parseSuggestedShareCounts } from "./campaign-modes";
import { parseShareLabels } from "./share-labels";
import { parseCategoryPriorities } from "./categories";
import { generateUniqueLocaleSlug, generateUniqueSlug } from "@/lib/slug";

function asInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

export function parseAdminCampaignCreatePayload(
  rawBody: unknown,
): ParsedCampaignCreatePayload {
  const body =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : {};

  return parseCampaignCreatePayload(rawBody, {
    categoryPriorities: parseCategoryPriorities(body.categoryPriorities),
    suggestedDonations: parseSuggestedDonations(body.suggestedDonations),
    suggestedTeamSupport: parseSuggestedTeamSupport(body.suggestedTeamSupport),
    suggestedShareCounts: parseSuggestedShareCounts(body.suggestedShareCounts),
    shareLabels: parseShareLabels(body.shareLabels),
  });
}

function campaignCreateData(data: CampaignPersistenceData): Prisma.CampaignCreateInput {
  return {
    title: data.title,
    description: data.description,
    targetAmount: data.targetAmount,
    currentAmount: data.currentAmount,
    images: data.images,
    videoUrl: data.videoUrl,
    isActive: data.isActive,
    priority: data.priority,
    categoryPriorities: asInputJson(data.categoryPriorities),
    suggestedDonations: asInputJson(data.suggestedDonations),
    suggestedTeamSupport: asInputJson(data.suggestedTeamSupport),
    goalType: data.goalType,
    fundraisingMode: data.fundraisingMode,
    sharePriceUSD: data.sharePriceUSD,
    suggestedShareCounts: asInputJson(data.suggestedShareCounts),
    shareLabels: asInputJson(data.shareLabels),
    slug: data.slug,
    categories: {
      connect: data.categoryIds.map((id) => ({ id })),
    },
  };
}

function translationCreateData(
  data: CampaignTranslationPersistenceData,
): Prisma.CampaignTranslationCreateInput {
  return {
    campaign: { connect: { id: data.campaignId } },
    locale: data.locale,
    title: data.title,
    description: data.description,
    image: data.image,
    videoUrl: data.videoUrl,
    slug: data.slug,
  };
}

export async function createAdminCampaign(
  input: ParsedCampaignCreatePayload,
): Promise<unknown> {
  const createCampaign = createCampaignCreator({
    transaction: async (operation) =>
      prisma.$transaction(
        async (tx) => {
          const transaction: CampaignCreateTransaction = {
            findCategories: (categoryIds) =>
              tx.category.findMany({
                where: { id: { in: categoryIds } },
                select: { id: true, isActive: true },
              }),
            generateCampaignSlug: (base) =>
              generateUniqueSlug(tx.campaign, base, {
                fallbackPrefix: "campaign",
              }),
            generateTranslationSlug: (locale, base) =>
              generateUniqueLocaleSlug(tx.campaignTranslation, base, {
                locale,
                fallbackPrefix: "campaign",
              }),
            createCampaign: (data) =>
              tx.campaign.create({
                data: campaignCreateData(data),
                select: { id: true, title: true },
              }),
            createTranslation: async (data) => {
              await tx.campaignTranslation.create({
                data: translationCreateData(data),
              });
            },
            getCreatedCampaign: (campaignId) =>
              tx.campaign.findUnique({
                where: { id: campaignId },
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  description: true,
                  targetAmount: true,
                  currentAmount: true,
                  images: true,
                  videoUrl: true,
                  isActive: true,
                  priority: true,
                  categoryIds: true,
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
                    select: {
                      locale: true,
                      title: true,
                      description: true,
                      image: true,
                      videoUrl: true,
                      slug: true,
                    },
                  },
                  categories: {
                    select: { id: true, slug: true, name: true, icon: true },
                  },
                },
              }),
          };
          return operation(transaction);
        },
        { maxWait: 10_000, timeout: 60_000 },
      ),
  });

  return createCampaign(input);
}
