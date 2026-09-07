import "server-only";

import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { whereByIdOrAnyLocaleSlug } from "@/lib/slug";

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
 *
 * Amounts are USD as stored; the display layer converts with the visitor's
 * selected rate. `DEVELOPER_HANDOFF §10` is explicit that currency conversion is
 * independent of language and that the donation's value never changes with it.
 */

export interface MinbarProject {
  id: string;
  slug: string;
  title: string;
  text: string;
  image: string | null;
  /** Category slug — the handoff's regional filter key (gaza, al-quds, …). */
  region: string | null;
  regionLabel: string | null;
  /** USD. `null` goal means an open-ended campaign: no bar, no percentage. */
  raised: number;
  goal: number | null;
  /** Quick-pick amounts configured per campaign, if any. */
  suggestedAmounts: number[] | null;
  priority: number | null;
}

/** Prisma select shared by every read here, so the shape can't drift. */
function selectFor(locale: string) {
  return {
    id: true,
    slug: true,
    title: true,
    description: true,
    images: true,
    targetAmount: true,
    currentAmount: true,
    goalType: true,
    priority: true,
    suggestedDonations: true,
    categories: {
      select: {
        slug: true,
        name: true,
        translations: { where: translationLocaleWhere(locale), select: { locale: true, name: true } },
      },
    },
    translations: {
      where: translationLocaleWhere(locale),
      select: { locale: true, title: true, description: true, slug: true, image: true },
    },
  } as const;
}

type CampaignRow = {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  images: string[];
  targetAmount: number;
  currentAmount: number;
  goalType: string;
  priority: number | null;
  suggestedDonations: unknown;
  categories: Array<{
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
  }>;
};

function toProject(row: CampaignRow, locale: string): MinbarProject {
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

  return {
    id: row.id,
    slug: t?.slug || row.slug || row.id,
    title: t?.title || row.title,
    text: t?.description || row.description,
    image: t?.image || row.images?.[0] || null,
    region: category?.slug ?? null,
    regionLabel: categoryT?.name || category?.name || null,
    raised: row.currentAmount,
    goal,
    suggestedAmounts: suggested && suggested.length ? suggested : null,
    priority: row.priority,
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

  return row ? toProject(row, locale) : null;
}

/**
 * Field updates published against a project, newest first.
 *
 * The detail page's "Updates" tab renders these as a dated timeline. An empty
 * list hides the tab rather than showing an empty one — the handoff is explicit
 * that reports appear only once approved and linked to the project.
 */
export interface MinbarProjectUpdate {
  id: string;
  title: string;
  text: string;
  image: string | null;
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
      // Serialised here so the value crossing to the client is a plain string;
      // the page formats it for the locale.
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/**
 * Other projects to show beneath a detail page.
 *
 * Same region first — a donor reading about Gaza food parcels is far more
 * likely to give to another Gaza project than to a random one — then anything
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
 * site has a `Slide` model the dashboard already curates for exactly this — an
 * editor picks the images, the wording and where each one leads — so the
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
