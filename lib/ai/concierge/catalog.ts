import "server-only";

import { prisma } from "@/lib/prisma";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { contentToBlocks } from "@/lib/blog/rich-text";
import { parseSuggestedDonations, resolveSuggestedAmountsForCurrency } from "@/lib/campaign/suggested-donations";
import { parseCartUpsell } from "@/lib/minbar/cart-upsell";
import { WAQF_UNIT_PRICE_USD } from "@/lib/minbar/waqf";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import type { CatalogCampaign, CatalogCategory } from "./recommend";

/**
 * The concierge's view of the site: every published campaign and category in
 * one locale, reduced to the fields recommendation and rendering need. Read
 * through the same Prisma filters the public pages use (`isActive`, not
 * soft-deleted), so the assistant can never surface something the site hides.
 *
 * Cached per locale for a few minutes: the catalog changes when an admin
 * publishes, not per visitor, and the assistant must answer fast.
 */

const CACHE_TTL_MS = 3 * 60 * 1000;

export interface ConciergeCatalog {
  locale: string;
  campaigns: CatalogCampaign[];
  categories: CatalogCategory[];
  /** Admin's cross-sell list from `/dashboard/cart-settings`, campaign ids in order. */
  upsellIds: string[];
  /** The zakat category the zakat page donates to, if published. */
  zakatCategoryId: string | null;
  waqf: Array<{ unit: "share" | "meter"; priceUSD: number; sharesPerUnit: number }>;
  loadedAt: number;
}

const cache = new Map<string, ConciergeCatalog>();

/** Plain-text summary of a campaign description (Tiptap JSON or HTML). */
export function summarize(description: string, max = 180): string {
  const text = contentToBlocks(description)
    .map((b) => b.text)
    .join(" ")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function kindOf(slug: string | null): CatalogCategory["kind"] {
  if (!slug) return "other";
  if (slug.startsWith("region-")) return "region";
  if (slug.startsWith("type-")) return "type";
  return "other";
}

export async function loadCatalog(locale: string): Promise<ConciergeCatalog> {
  const hit = cache.get(locale);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;

  const [campaignRows, categoryRows, settings] = await Promise.all([
    prisma.campaign.findMany({
      where: { AND: [{ isActive: true }, NOT_SOFT_DELETED] },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        images: true,
        targetAmount: true,
        currentAmount: true,
        goalType: true,
        priority: true,
        fundraisingMode: true,
        sharePriceUSD: true,
        suggestedDonations: true,
        categoryIds: true,
        createdAt: true,
        categories: {
          select: { id: true, slug: true, name: true, translations: { where: translationLocaleWhere(locale), select: { locale: true, name: true } } },
        },
        translations: { where: translationLocaleWhere(locale), select: { locale: true, title: true, description: true, slug: true, image: true } },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    }),
    prisma.category.findMany({
      where: { NOT: { isActive: false } },
      select: {
        id: true,
        slug: true,
        name: true,
        donateToCategory: true,
        donateCampaignId: true,
        pageTemplate: true,
        translations: { where: translationLocaleWhere(locale), select: { locale: true, name: true } },
      },
    }),
    prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { cartUpsell: true } }),
  ]);

  const campaigns: CatalogCampaign[] = campaignRows.map((row) => {
    const t = pickTranslation(row.translations, locale);
    const first = row.categories.find((c) => c.slug?.startsWith("region-")) ?? row.categories[0];
    const firstT = first ? pickTranslation(first.translations, locale) : null;
    const suggested = parseSuggestedDonations(row.suggestedDonations);
    const supportsShares = row.fundraisingMode === "SHARES" && typeof row.sharePriceUSD === "number" && row.sharePriceUSD > 0;
    return {
      id: row.id,
      slug: t?.slug || row.slug || row.id,
      title: t?.title || row.title,
      summary: summarize(t?.description || row.description || ""),
      image: t?.image || row.images?.[0] || null,
      categorySlugs: row.categories.map((c) => c.slug).filter((s): s is string => Boolean(s)),
      categoryIds: row.categoryIds,
      regionSlug: first?.slug ?? null,
      regionLabel: firstT?.name || first?.name || null,
      priority: row.priority,
      raisedUSD: row.currentAmount,
      goalUSD: row.goalType === "OPEN" ? null : row.targetAmount,
      suggestedAmountsUSD: resolveSuggestedAmountsForCurrency(suggested, "USD"),
      supportsShares,
      sharePriceUSD: supportsShares ? row.sharePriceUSD : null,
      createdAt: row.createdAt.getTime(),
    };
  });

  const counts = new Map<string, number>();
  for (const c of campaigns) for (const id of c.categoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  const categories: CatalogCategory[] = categoryRows.map((row) => ({
    id: row.id,
    slug: row.slug ?? row.id,
    title: pickTranslation(row.translations, locale)?.name || row.name,
    kind: kindOf(row.slug),
    projectCount: counts.get(row.id) ?? 0,
    canDonateDirectly: row.donateToCategory === true,
  }));

  const zakat = categoryRows.find((r) => r.pageTemplate === "zakat") ?? categoryRows.find((r) => r.slug === "type-zakat");

  const catalog: ConciergeCatalog = {
    locale,
    campaigns,
    categories,
    upsellIds: parseCartUpsell(settings?.cartUpsell).items.map((i) => i.campaignId),
    zakatCategoryId: zakat?.id ?? null,
    waqf: [
      { unit: "share", priceUSD: WAQF_UNIT_PRICE_USD.share, sharesPerUnit: 1 },
      { unit: "meter", priceUSD: WAQF_UNIT_PRICE_USD.meter, sharesPerUnit: Math.round(WAQF_UNIT_PRICE_USD.meter / WAQF_UNIT_PRICE_USD.share) },
    ],
    loadedAt: Date.now(),
  };
  cache.set(locale, catalog);
  return catalog;
}

/** Forget every cached locale — for tests and after a CMS write, if wired. */
export function clearCatalogCache(): void {
  cache.clear();
}
