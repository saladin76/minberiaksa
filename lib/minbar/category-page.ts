import { prisma } from "@/lib/prisma";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { whereByIdOrAnyLocaleSlug } from "@/lib/slug";
import { listProjectsInCategory, type MinbarProject } from "./projects";
import { listVideos, type CmsVideo } from "./cms";
import { youtubeId as parseYoutubeId } from "@/lib/content/translation-write";

/**
 * Server-side reader for a category's own landing page.
 *
 * Every category is published as a project page in the shape of
 * `Minbar/مشروع ترميم منازل القدس.dc.html` — hero with a film, a figures band,
 * the values it stands on, its campaigns as donate cards, a donation box,
 * three explanatory cards, and its achievements in video.
 *
 * Text arrives already resolved for the visitor's locale — Arabic from the row,
 * anything else from the translation with English as the fallback — so the page
 * component never sees a translation table. Sections whose fields are empty come
 * back empty and are not rendered, which is what lets a bare category still
 * publish as a hero plus its campaigns.
 */

export interface CategoryPageValue {
  id: string;
  label: string;
}

export interface CategoryPageCard {
  id: string;
  icon: string;
  title: string;
  body: string;
}

export interface CategoryPageContent {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  heroImage: string;
  /** Bare YouTube id, or "" when the hero carries no film. */
  heroVideoId: string;
  heroLead: string;
  ctaLabel: string;
  /** The figures band; null when no goal is set. */
  stats: { done: number; doneLabel: string; goal: number; goalLabel: string; percent: number } | null;
  projectsTitle: string;
  donateTitle: string;
  donateNote: string;
  suggestedAmounts: number[];
  /**
   * The campaign the donation box gives to. A donation is always made to a
   * campaign — the cart stores campaign slugs and the order pipeline resolves
   * them — so the box targets the editor's chosen campaign, or the highest
   * priority one in the category. Null when the category has no campaign at
   * all, in which case the box is not rendered.
   */
  donateTarget: { id: string; slug: string; title: string } | null;
  achievementsTitle: string;
  values: CategoryPageValue[];
  cards: CategoryPageCard[];
  projects: MinbarProject[];
  achievements: CmsVideo[];
}

const PAGE_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  image: true,
  heroImage: true,
  heroVideoUrl: true,
  heroLead: true,
  ctaLabel: true,
  statDoneValue: true,
  statDoneLabel: true,
  statGoalValue: true,
  statGoalLabel: true,
  projectsTitle: true,
  donateTitle: true,
  donateNote: true,
  suggestedAmounts: true,
  donateCampaignId: true,
  achievementsTitle: true,
  achievementVideoIds: true,
  values: {
    orderBy: { order: "asc" as const },
    select: { id: true, label: true },
  },
  infoCards: {
    orderBy: { order: "asc" as const },
    select: { id: true, icon: true, title: true, body: true },
  },
} as const;

/** One category's whole page, or `null` when the slug names nothing. */
export async function getCategoryPage(
  idOrSlug: string,
  locale: string
): Promise<CategoryPageContent | null> {
  /* `whereByIdOrAnyLocaleSlug` only matches on `id` when the key actually looks
     like an ObjectId, so an unknown slug misses rather than throwing. */
  const row = await prisma.category.findFirst({
    where: whereByIdOrAnyLocaleSlug(idOrSlug),
    select: {
      ...PAGE_SELECT,
      translations: {
        where: translationLocaleWhere(locale),
        take: 2,
        select: {
          locale: true,
          name: true,
          description: true,
          slug: true,
          heroLead: true,
          ctaLabel: true,
          statDoneLabel: true,
          statGoalLabel: true,
          projectsTitle: true,
          donateTitle: true,
          donateNote: true,
          achievementsTitle: true,
        },
      },
    },
  });
  if (!row) return null;

  const t = pickTranslation(row.translations, locale);

  /* Child translations are fetched together rather than per row: a page with
     five values and three cards would otherwise be eight extra queries. */
  const valueIds = row.values.map((v) => v.id);
  const cardIds = row.infoCards.map((c) => c.id);
  const achievementIds = row.achievementVideoIds ?? [];

  const [valueTranslations, cardTranslations, allAchievements, projects] = await Promise.all([
    valueIds.length
      ? prisma.categoryValueTranslation.findMany({
          where: { valueId: { in: valueIds }, ...translationLocaleWhere(locale) },
          select: { valueId: true, locale: true, label: true },
        })
      : Promise.resolve([]),
    cardIds.length
      ? prisma.categoryInfoCardTranslation.findMany({
          where: { cardId: { in: cardIds }, ...translationLocaleWhere(locale) },
          select: { cardId: true, locale: true, title: true, body: true },
        })
      : Promise.resolve([]),
    achievementIds.length ? listVideos(locale, "ACHIEVEMENT") : Promise.resolve([] as CmsVideo[]),
    listProjectsInCategory(row.id, locale),
  ]);

  const byValue = new Map<string, typeof valueTranslations>();
  for (const tr of valueTranslations) {
    const list = byValue.get(tr.valueId) ?? [];
    list.push(tr);
    byValue.set(tr.valueId, list);
  }
  const byCard = new Map<string, typeof cardTranslations>();
  for (const tr of cardTranslations) {
    const list = byCard.get(tr.cardId) ?? [];
    list.push(tr);
    byCard.set(tr.cardId, list);
  }

  const values: CategoryPageValue[] = row.values.map((v) => ({
    id: v.id,
    label: pickTranslation(byValue.get(v.id) ?? [], locale)?.label || v.label,
  }));

  const cards: CategoryPageCard[] = row.infoCards.map((c) => {
    const ct = pickTranslation(byCard.get(c.id) ?? [], locale);
    return { id: c.id, icon: c.icon, title: ct?.title || c.title, body: ct?.body || c.body };
  });

  /* The achievements rail keeps the editor's order, and a video that has since
     been unpublished drops out of it. */
  const achievementsById = new Map(allAchievements.map((v) => [v.id, v] as const));
  const achievements = achievementIds
    .map((id) => achievementsById.get(id))
    .filter((v): v is CmsVideo => Boolean(v));

  /* `projects` is already ordered priority-first, so the fallback target is
     simply its head. An explicit choice that has since been archived falls back
     the same way rather than leaving the box pointing at nothing. */
  const donateTarget =
    (row.donateCampaignId ? projects.find((p) => p.id === row.donateCampaignId) : undefined) ??
    projects[0] ??
    null;

  const done = row.statDoneValue ?? 0;
  const goal = row.statGoalValue ?? 0;

  return {
    id: row.id,
    slug: t?.slug || row.slug || row.id,
    name: t?.name || row.name,
    description: t?.description || row.description || "",
    image: row.image ?? "",
    heroImage: row.heroImage || row.image || "",
    heroVideoId: row.heroVideoUrl ? parseYoutubeId(row.heroVideoUrl) : "",
    heroLead: t?.heroLead || row.heroLead || t?.description || row.description || "",
    ctaLabel: t?.ctaLabel || row.ctaLabel || "",
    stats:
      goal > 0
        ? {
            done,
            doneLabel: t?.statDoneLabel || row.statDoneLabel || "",
            goal,
            goalLabel: t?.statGoalLabel || row.statGoalLabel || "",
            percent: Math.min(Math.round((done / goal) * 100), 100),
          }
        : null,
    projectsTitle: t?.projectsTitle || row.projectsTitle || "",
    donateTarget: donateTarget
      ? { id: donateTarget.id, slug: donateTarget.slug, title: donateTarget.title }
      : null,
    donateTitle: t?.donateTitle || row.donateTitle || "",
    donateNote: t?.donateNote || row.donateNote || "",
    suggestedAmounts: row.suggestedAmounts ?? [],
    achievementsTitle: t?.achievementsTitle || row.achievementsTitle || "",
    values,
    cards,
    projects,
    achievements,
  };
}
