import "server-only";

import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { whereByIdOrAnyLocaleSlug } from "@/lib/slug";
import { FUNDRAISING_SHARES, cardShareCounts, parseSuggestedShareCounts } from "@/lib/campaign/campaign-modes";
import { parseShareLabels } from "@/lib/campaign/share-labels";
import { cardDonationAmounts, parseSuggestedDonations } from "@/lib/campaign/suggested-donations";
import { contentToBlocks, type ArticleBlock } from "@/lib/blog/rich-text";
import { PAID_DONATION_FILTER } from "@/lib/dashboard/donation-usd-revenue";
import { normalizeSeoFields, type ProjectSeoFields } from "@/lib/campaign/project-seo";
import { parseRecommendedFrequency } from "@/lib/minbar/recommended-frequency";
import type { CartFreqKey } from "@/lib/minbar/cart";

/**
 * Project data for the Minbar pages.
 *
 * The handoff shipped `Minbar/projects-data.js` as mock data and
 * `SOURCE_OF_TRUTH.md` names its production replacement explicitly:
 * "projects-data.js + projects-i18n.js → Projects API (CMS)". That CMS already
 * exists here as `Campaign` + `CampaignTranslation`, so this module is the
 * mapping layer rather than a copy of the mock file.
 *
 * Field mapping:
 *   slug        ← CampaignTranslation.slug || Campaign.slug || id
 *   title/text  ← translation for the locale → en → base Arabic
 *   raised      ← currentAmount   (baseline + settled items; never recomputed here)
 *   goal        ← targetAmount, or null for OPEN campaigns, which the design
 *                 renders without a progress bar
 *   region      ← first category slug, which is how the handoff's filters group
 *   image       ← per-locale cover when set, else images[0]
 *   images      ← the whole gallery, with the per-locale cover first
 *   videoUrl    ← per-locale video when set, else Campaign.videoUrl
 *   categories  ← every category the campaign is filed under, in order
 *   shares      ← set only for a سهوم campaign (fundraisingMode SHARES with a
 *                 positive sharePriceUSD): the donor gives whole shares and
 *                 the amount is always count × price
 *
 * Amounts are USD as stored; the display layer converts with the visitor's
 * selected rate. `DEVELOPER_HANDOFF §10` is explicit that currency conversion is
 * independent of language and that the donation's value never changes with it.
 */

export interface MinbarProject {
  id: string;
  slug: string;
  title: string;
  /** The description as plain text (it is stored as Tiptap JSON, HTML or text). */
  text: string;
  /**
   * The description's structure  headings, paragraphs, list items. Filled
   * by `getProject` only; lists (cards) leave it empty to keep pages light.
   */
  body: ArticleBlock[];
  image: string | null;
  /** Category slug  the handoff's regional filter key (gaza, al-quds, …). */
  region: string | null;
  regionLabel: string | null;
  /** USD. `null` goal means an open-ended campaign: no bar, no percentage. */
  raised: number;
  goal: number | null;
  /** Every photo of the campaign, the cover (per-locale when set) first. */
  images: string[];
  /** Per-locale video when set, else the campaign's own. */
  videoUrl: string | null;
  /** Every category the campaign is filed under. `region` is the first. */
  categories: Array<{ id: string; slug: string | null; label: string }>;
  /** Quick-pick amounts configured per campaign, if any. */
  suggestedAmounts: number[] | null;
  /**
   * Quick-pick amounts per currency code, in that currency (not USD). Used
   * in place of `suggestedAmounts` for a visitor browsing in that currency.
   */
  suggestedAmountsByCurrency: Record<string, number[]> | null;
  /**
   * The (up to three, USD) amounts the campaign card offers: the dashboard's
   * picks from `suggestedAmounts`, else 100 / 500 / 1000. The campaign page
   * offers the whole list.
   */
  cardAmounts: number[];
  priority: number | null;
  /**
   * Set on a سهوم (shares) campaign: donors pick a number of shares rather
   * than an amount. `null` for an ordinary amount campaign.
   */
  shares: MinbarProjectShares | null;
  /**
   * The cadence the card's giving dialog recommends and preselects; null when
   * the campaign recommends none. Unset on the campaign means "monthly".
   */
  recommendedFrequency: CartFreqKey | null;
}

export interface MinbarProjectShares {
  /** Price of one share, USD. */
  priceUSD: number;
  /** Quick-pick share counts, ascending (the campaign page). */
  counts: number[];
  /** The (up to three) counts the campaign card offers; default 1 / 2 / 5. */
  cardCounts: number[];
  /** The price of one share in a given currency, set by an admin (not USD). */
  priceByCurrency: Record<string, number> | null;
  /**
   * The campaign's own name for its unit in this locale (e.g. خروف / خراف),
   * or `null` to use the generic "share / shares" wording.
   */
  unit: { singular: string; plural: string } | null;
}

/** Prisma select shared by every read here, so the shape can't drift. */
function selectFor(locale: string) {
  return {
    id: true,
    slug: true,
    title: true,
    description: true,
    images: true,
    videoUrl: true,
    targetAmount: true,
    currentAmount: true,
    goalType: true,
    priority: true,
    suggestedDonations: true,
    fundraisingMode: true,
    sharePriceUSD: true,
    suggestedShareCounts: true,
    shareLabels: true,
    recommendedFrequency: true,
    categoryPriorities: true,
    createdAt: true,
    categories: {
      select: {
        id: true,
        slug: true,
        name: true,
        translations: { where: translationLocaleWhere(locale), select: { locale: true, name: true } },
      },
    },
    translations: {
      where: translationLocaleWhere(locale),
      select: { locale: true, title: true, description: true, slug: true, image: true, videoUrl: true },
    },
  } as const;
}

type CampaignRow = {
  id: string;
  recommendedFrequency: string | null;
  slug: string | null;
  title: string;
  description: string;
  images: string[];
  videoUrl: string | null;
  targetAmount: number;
  currentAmount: number;
  goalType: string;
  priority: number | null;
  suggestedDonations: unknown;
  fundraisingMode: string;
  sharePriceUSD: number | null;
  suggestedShareCounts: unknown;
  shareLabels: unknown;
  categoryPriorities: unknown;
  createdAt: Date;
  categories: Array<{
    id: string;
    slug: string | null;
    name: string;
    translations: Array<{ locale: string; name: string }>;
  }>;
  translations: Array<{
    locale: string;
    title: string;
    description: string;
    slug: string | null;
    image: string | null;
    videoUrl: string | null;
  }>;
};

/**
 * The shares setup of a سهوم campaign, or `null`. A SHARES campaign saved
 * without a usable price is treated as an amount campaign: there is nothing
 * to multiply a count by.
 */
function sharesFor(row: CampaignRow, locale: string): MinbarProjectShares | null {
  if (row.fundraisingMode !== FUNDRAISING_SHARES) return null;
  const price = Number(row.sharePriceUSD);
  if (!Number.isFinite(price) || price <= 0) return null;
  /* Only this locale's unit name: a French page must not borrow the Arabic
     خراف because French was left blank  the generic wording reads better. */
  const unit = parseShareLabels(row.shareLabels)?.[locale] ?? null;
  const shareConfig = parseSuggestedShareCounts(row.suggestedShareCounts);
  return {
    priceUSD: price,
    counts: shareConfig.counts,
    cardCounts: cardShareCounts(shareConfig),
    priceByCurrency: shareConfig.priceByCurrency && Object.keys(shareConfig.priceByCurrency).length ? shareConfig.priceByCurrency : null,
    unit: unit ? { singular: unit.singular, plural: unit.plural } : null,
  };
}

function toProject(row: CampaignRow, locale: string, detail = false): MinbarProject {
  const t = pickTranslation(row.translations, locale);
  const category = row.categories?.[0];
  const categoryT = pickTranslation(category?.translations ?? [], locale);

  // An OPEN campaign has no fixed target, so the design shows no bar and no
  // percentage rather than a bar against a number that means nothing.
  const goal = row.goalType === "OPEN" ? null : row.targetAmount;

  const suggested =
    row.suggestedDonations &&
    typeof row.suggestedDonations === "object" &&
    Array.isArray((row.suggestedDonations as { amounts?: unknown }).amounts)
      ? ((row.suggestedDonations as { amounts: unknown[] }).amounts.filter(
          (n): n is number => typeof n === "number" && n > 0
        ) as number[])
      : null;

  /* Descriptions are written in the dashboard's rich-text editor and stored
     as Tiptap JSON (older rows: HTML or plain text). Shown raw, the page and
     its meta description printed the JSON. */
  const rawDescription = t?.description || row.description;
  /* Markdown pasted into the editor arrives as paragraphs that still start
     with "###" or "- "; read those as the heading or list item they are. */
  const body = contentToBlocks(rawDescription).map((block): ArticleBlock => {
    if (block.kind !== "p") return block;
    const heading = block.text.match(/^#{1,6}\s+(.+)$/);
    if (heading) return { kind: "h2", text: heading[1] };
    const item = block.text.match(/^[-*•]\s+(.+)$/);
    return item ? { kind: "li", text: item[1] } : block;
  });
  const text = body.length ? body.map((b) => b.text).join(" ").replace(/\s+/g, " ").trim() : rawDescription;

  const donationConfig = parseSuggestedDonations(row.suggestedDonations);
  const byCurrency = row.suggestedDonations ? donationConfig.byCurrency : {};
  const cover = t?.image || row.images?.[0] || null;
  const images = [...new Set([...(cover ? [cover] : []), ...(row.images ?? []).slice(t?.image ? 1 : 0)].filter(Boolean))];

  return {
    id: row.id,
    slug: t?.slug || row.slug || row.id,
    title: t?.title || row.title,
    text,
    body: detail ? (body.length ? body : [{ kind: "p", text }]) : [],
    image: cover,
    images,
    videoUrl: t?.videoUrl || row.videoUrl || null,
    categories: (row.categories ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      label: pickTranslation(c.translations ?? [], locale)?.name || c.name,
    })),
    suggestedAmountsByCurrency: Object.keys(byCurrency).length ? byCurrency : null,
    cardAmounts: cardDonationAmounts(donationConfig),
    region: category?.slug ?? null,
    regionLabel: categoryT?.name || category?.name || null,
    raised: row.currentAmount,
    goal,
    suggestedAmounts: suggested && suggested.length ? suggested : null,
    priority: row.priority,
    shares: sharesFor(row, locale),
    recommendedFrequency: parseRecommendedFrequency(row.recommendedFrequency),
  };
}

/**
 * Every published project, ordered the way the design lists them: prioritised
 * campaigns first (ascending priority), then newest.
 */
export async function listProjects(locale: string, limit?: number): Promise<MinbarProject[]> {
  const rows = (await prisma.campaign.findMany({
    where: { AND: [{ isActive: true }, NOT_SOFT_DELETED] },
    select: selectFor(locale),
    // MongoDB sorts nulls first on ascending, so an explicit newest-first
    // secondary key keeps unprioritised campaigns in a stable, sensible order.
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    ...(limit ? { take: limit } : {}),
  })) as unknown as CampaignRow[];

  return rows.map((row) => toProject(row, locale));
}

/**
 * Every published project filed under one category, in the same order.
 *
 * Filtered on `categoryIds` rather than on `MinbarProject.region`: region is
 * only the FIRST category's slug, so a campaign in both a place and a type
 * would be invisible on one of the two pages.
 */
export async function listProjectsInCategory(
  categoryId: string,
  locale: string,
  limit?: number
): Promise<MinbarProject[]> {
  const rows = (await prisma.campaign.findMany({
    where: { AND: [{ isActive: true }, NOT_SOFT_DELETED, { categoryIds: { has: categoryId } }] },
    select: selectFor(locale),
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  })) as unknown as CampaignRow[];

  /* The order an admin set for THIS category (`categoryPriorities`, from the
     categories dashboard) comes first; campaigns without one follow in the
     site-wide order. Sorted here because the priority lives in a JSON map. */
  const rank = (row: CampaignRow): number => {
    const map = row.categoryPriorities;
    const value = map && typeof map === "object" && !Array.isArray(map) ? (map as Record<string, unknown>)[categoryId] : undefined;
    return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  const ordered = rows
    .map((row, index) => ({ row, index, rank: rank(row) }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map(({ row }) => row);

  return (limit ? ordered.slice(0, limit) : ordered).map((row) => toProject(row, locale));
}

/**
 * One project by its slug in this locale.
 *
 * Looks in the per-locale translation slugs as well as the base slug, because
 * `PRODUCTION_SEO_CONTRACT.md` gives every language its own slug and a visitor
 * on `/fr/projects/<french-slug>` must resolve.
 */
export async function getProject(slug: string, locale: string): Promise<MinbarProject | null> {
  /* `id` is a Mongo ObjectId column: handing it an arbitrary slug makes Prisma
     throw rather than miss, which turns every unknown project URL into a 500
     instead of a 404. `whereByIdOrAnyLocaleSlug` only matches on `id` when the
     key actually looks like one. */
  const row = (await prisma.campaign.findFirst({
    where: {
      AND: [{ isActive: true }, NOT_SOFT_DELETED, whereByIdOrAnyLocaleSlug(slug)],
    },
    select: selectFor(locale),
  })) as unknown as CampaignRow | null;

  return row ? toProject(row, locale, true) : null;
}

/**
 * The SEO fields an admin set on the campaign's SEO page (`SeoPanel`):
 * this locale's (the campaign document for Arabic, the translation
 * otherwise) and the campaign-level ones. They are not in the Prisma model,
 * so they are read from the raw documents, as the legacy campaign page does.
 */
export async function getProjectSeo(
  projectId: string,
  locale: string
): Promise<{ locale: ProjectSeoFields; campaign: ProjectSeoFields }> {
  const firstDoc = (result: unknown) =>
    ((result as { cursor?: { firstBatch?: unknown[] } })?.cursor?.firstBatch ?? [])[0] ?? null;
  try {
    const [campaignResult, translationResult] = await Promise.all([
      prisma.$runCommandRaw({ find: "Campaign", filter: { _id: { $oid: projectId } }, limit: 1 }),
      locale === "ar"
        ? Promise.resolve(null)
        : prisma.$runCommandRaw({ find: "CampaignTranslation", filter: { campaignId: { $oid: projectId }, locale }, limit: 1 }),
    ]);
    const campaign = normalizeSeoFields(firstDoc(campaignResult));
    return { campaign, locale: locale === "ar" ? campaign : normalizeSeoFields(firstDoc(translationResult)) };
  } catch (err) {
    console.error("getProjectSeo failed:", err);
    return { campaign: {}, locale: {} };
  }
}

/**
 * How many settled donations a project has received  the same count the
 * campaign API and dashboard show (a paid donation, not a pending one).
 */
export async function getProjectDonorCount(projectId: string): Promise<number> {
  try {
    return await prisma.donationItem.count({ where: { campaignId: projectId, donation: PAID_DONATION_FILTER } });
  } catch (err) {
    console.error("getProjectDonorCount failed:", err);
    return 0;
  }
}

/**
 * Donors' public messages on a project, newest first. Only the first name
 * and avatar are exposed  never an email.
 */
export interface MinbarProjectComment {
  id: string;
  text: string;
  name: string;
  image: string | null;
  createdAt: string;
}

export async function listProjectComments(projectId: string, take = 30): Promise<MinbarProjectComment[]> {
  try {
    const rows = await prisma.comment.findMany({
      where: { campaignId: projectId },
      select: { id: true, text: true, createdAt: true, user: { select: { name: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      name: (row.user?.name ?? "").trim().split(/\s+/)[0] ?? "",
      image: row.user?.image ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch (err) {
    console.error("listProjectComments failed:", err);
    return [];
  }
}

/**
 * Field updates published against a project, newest first.
 *
 * The detail page's "Updates" tab renders these as a dated timeline. An empty
 * list hides the tab rather than showing an empty one  the handoff is explicit
 * that reports appear only once approved and linked to the project.
 */
export interface MinbarProjectUpdate {
  id: string;
  title: string;
  text: string;
  image: string | null;
  /** A YouTube / Vimeo / Facebook link or an uploaded video file. */
  videoUrl: string | null;
  createdAt: string;
}

export async function listProjectUpdates(
  projectId: string,
  locale: string
): Promise<MinbarProjectUpdate[]> {
  const rows = await prisma.update.findMany({
    where: { campaignId: projectId },
    select: {
      id: true,
      title: true,
      description: true,
      image: true,
      videoUrl: true,
      createdAt: true,
      translations: {
        where: translationLocaleWhere(locale),
        select: { locale: true, title: true, description: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => {
    const t = pickTranslation(row.translations, locale);
    return {
      id: row.id,
      title: t?.title || row.title,
      text: t?.description || row.description,
      image: row.image,
      videoUrl: row.videoUrl ?? null,
      // Serialised here so the value crossing to the client is a plain string;
      // the page formats it for the locale.
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * Other projects to show beneath a detail page.
 *
 * Same region first  a donor reading about Gaza food parcels is far more
 * likely to give to another Gaza project than to a random one  then anything
 * else to fill the row.
 */
export async function listRelatedProjects(
  project: MinbarProject,
  locale: string,
  count = 3
): Promise<MinbarProject[]> {
  const all = await listProjects(locale);
  const others = all.filter((p) => p.slug !== project.slug);
  const sameRegion = others.filter((p) => p.region && p.region === project.region);
  const rest = others.filter((p) => !p.region || p.region !== project.region);
  return [...sameRegion, ...rest].slice(0, count);
}

/** Projects grouped by region, in the order the design's pickers use. */
export async function listProjectsByRegion(
  locale: string
): Promise<Array<{ region: string; label: string; items: MinbarProject[] }>> {
  const projects = await listProjects(locale);
  const groups = new Map<string, { region: string; label: string; items: MinbarProject[] }>();

  for (const project of projects) {
    const key = project.region ?? "global";
    const existing = groups.get(key);
    if (existing) existing.items.push(project);
    else groups.set(key, { region: key, label: project.regionLabel ?? key, items: [project] });
  }

  return [...groups.values()];
}

/**
 * The hero carousel's slides, from the CMS.
 *
 * `Minbar/المشاريع.dc.html` derives its carousel from the project list. The
 * site has a `Slide` model the dashboard already curates for exactly this  an
 * editor picks the images, the wording and where each one leads  so the
 * carousel reads that instead, and falls back to the newest projects when no
 * slide is published rather than showing an empty hero.
 */
export interface MinbarSlide {
  id: string;
  title: string;
  image: string | null;
  /** Where the slide leads. Empty when the editor set no link. */
  href: string;
}

export async function listSlides(locale: string): Promise<MinbarSlide[]> {
  try {
    const rows = await prisma.slide.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        image: true,
        buttonLink: true,
        showButton: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true },
        },
      },
    });

    return rows.map((row) => {
      const t = pickTranslation(row.translations, locale);
      return {
        id: row.id,
        title: t?.title || row.title,
        image: row.image || null,
        /* A slide with its button switched off is still a slide; it just does
           not carry a destination. */
        href: row.showButton ? (row.buttonLink ?? "") : "",
      };
    });
  } catch (err) {
    console.error("listSlides failed:", err);
    return [];
  }
}
