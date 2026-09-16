/**
 * prisma/seed/seed-category-pages.ts — give every category the page it owns.
 *
 * Each category is now published as a project page in the shape of
 * `Minbar/مشروع ترميم منازل القدس.dc.html`. This fills the parts of that page
 * that can be DERIVED from what the database already holds, and nothing else:
 *
 *   · the section headings and the hero button, built from the category's own
 *     name ("مشاريع غزة", "ساهم في غزة", …);
 *   · a hero photograph, taken from the first image of the category's first
 *     campaign — a real field photograph of that work, not a stock picture;
 *   · a one-line lead that states what the page is, with no claim in it;
 *   · the quick amounts the donation box offers;
 *   · the achievement videos, matched to the category by the `regionKey` the
 *     video library already tags them with.
 *
 * What it deliberately does NOT invent: the figures band (how many homes were
 * restored, of how many), the values strip, and the three explanatory cards.
 * Those are claims about the organisation's work — they belong to whoever knows
 * them, and the dashboard now has a field for each, with the translate button
 * beside it. A category without them simply renders without those sections.
 *
 * Idempotent: a field that already carries something is left alone unless
 * `--force` is passed. Re-running never duplicates a value or a card.
 *
 *   npx tsx prisma/seed/seed-category-pages.ts [--force] [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { messagesFor } from "../../i18n/locale-messages";

const prisma = new PrismaClient();

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");

/** The quick amounts the donation box offers, in USD. */
const AMOUNTS = [100, 200, 300, 500, 700, 1000, 1500, 2000, 3000];

/**
 * `Video.regionKey` → category slug. The video library tags its achievements
 * with the homepage's region keys; these are the categories they belong to.
 * A key with no entry here (e.g. `regionField`, which is the field team rather
 * than a place) is not attached to any category.
 */
const VIDEO_REGION_TO_CATEGORY: Record<string, string> = {
  regionGaza: "region-gaza",
  regionQuds: "region-al-quds",
  regionAqsa: "region-al-aqsa",
};

/**
 * Categories published as one of the site's own pages rather than as a
 * landing page of their own — the mosque and zakat had pages before categories
 * did, and those pages fold the category in. `Category.pageTemplate`.
 */
const PAGE_TEMPLATES: Record<string, "aqsa" | "zakat"> = {
  "region-al-aqsa": "aqsa",
  "type-zakat": "zakat",
};

/**
 * What a bound category says and shows, taken from the page it is published
 * as. Those pages were written and reviewed before categories could publish
 * themselves — their hero pictures, their lead, their headings and their quick
 * amounts are the right ones — so the category carries that copy, in every
 * locale, rather than the derived placeholders the loop above gives the rest.
 * Always applied, `--force` or not: the page's copy is the source of truth.
 */
type StaticPageCopy = {
  heroImage: string;
  suggestedAmounts?: number[];
  /** Keys in the page's message namespace; `null` clears the field. */
  copy: (m: Record<string, string>) => {
    heroLead: string | null;
    ctaLabel: string | null;
    projectsTitle: string | null;
    description: string | null;
    donateTitle: string | null;
    donateNote: string | null;
  };
};

const STATIC_PAGE_COPY: Record<"aqsa" | "zakat", { namespace: string; nameKey: string } & StaticPageCopy> = {
  aqsa: {
    namespace: "aqsa",
    /* `navigation.aqsa` — the page's name in the header, for locales where the
       category has no translation row yet. */
    nameKey: "aqsa",
    heroImage: "/minbar/assets/aqsa-hero-3d.png",
    copy: (m) => ({
      heroLead: m.heroLead ?? null,
      ctaLabel: m.supportAqsaProjects ?? null,
      projectsTitle: m.ourRole ?? null,
      description: m.ourRoleLead ?? null,
      donateTitle: m.ctaTitle ?? null,
      donateNote: m.ctaText ?? null,
    }),
  },
  zakat: {
    namespace: "zakat",
    nameKey: "zakat",
    heroImage: "/minbar/assets/zakat-hero-coins.png",
    /* The hero's own quick amounts, as the page had them. */
    suggestedAmounts: [1000, 2000, 3000, 5000],
    copy: (m) => ({
      /* The zakat hero carries no lead and no scroll button of its own. */
      heroLead: null,
      ctaLabel: null,
      projectsTitle: m.heroTitle ?? null,
      description: m.whyText ?? null,
      donateTitle: m.ctaTitle ?? null,
      donateNote: m.ctaText ?? null,
    }),
  },
};

async function seedBoundCategories() {
  const bound = await prisma.category.findMany({
    where: { pageTemplate: { in: Object.keys(STATIC_PAGE_COPY) } },
    select: { id: true, slug: true, pageTemplate: true, translations: { select: { locale: true } } },
  });
  if (!bound.length) return;

  console.log("\nbound to a site page — copy from that page's bundle:");
  for (const category of bound) {
    const spec = STATIC_PAGE_COPY[category.pageTemplate as "aqsa" | "zakat"];
    const have = new Set(category.translations.map((t) => t.locale));
    const missing: string[] = [];
    const created: string[] = [];

    for (const locale of SUPPORTED_LOCALES) {
      const ns = messagesFor(locale)[spec.namespace];
      const copy = spec.copy((ns && typeof ns === "object" ? ns : {}) as Record<string, string>);
      if (DRY) continue;
      if (locale === "ar") {
        await prisma.category.update({
          where: { id: category.id },
          data: { ...copy, heroImage: spec.heroImage, ...(spec.suggestedAmounts ? { suggestedAmounts: spec.suggestedAmounts } : {}) },
        });
      } else if (have.has(locale)) {
        await prisma.categoryTranslation.updateMany({ where: { categoryId: category.id, locale }, data: copy });
      } else {
        /* No translation row for this locale yet. The page is named in the
           header in every locale, so the row is created with that name; the
           locale's slug is left for the slug backfill, as for any new row. */
        const nav = messagesFor(locale).navigation as Record<string, string> | undefined;
        const name = nav?.[spec.nameKey];
        if (!name) {
          missing.push(locale);
          continue;
        }
        await prisma.categoryTranslation.create({ data: { categoryId: category.id, locale, name, ...copy } });
        created.push(locale);
      }
    }
    console.log(
      `  ${DRY ? "·" : "✓"} ${category.slug} ← ${spec.namespace} bundle, hero ${spec.heroImage}` +
        (created.length ? ` (new translation rows: ${created.join(", ")})` : "") +
        (missing.length ? ` (no name for: ${missing.join(", ")})` : "")
    );
  }
}

async function main() {
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      image: true,
      heroImage: true,
      heroLead: true,
      ctaLabel: true,
      projectsTitle: true,
      donateTitle: true,
      achievementsTitle: true,
      suggestedAmounts: true,
      achievementVideoIds: true,
      campaignIds: true,
      pageTemplate: true,
    },
    orderBy: { order: "asc" },
  });

  const achievements = await prisma.video.findMany({
    where: { type: "ACHIEVEMENT" },
    select: { id: true, regionKey: true, order: true },
    orderBy: { order: "asc" },
  });

  const videosByCategory = new Map<string, string[]>();
  for (const video of achievements) {
    const slug = video.regionKey ? VIDEO_REGION_TO_CATEGORY[video.regionKey] : undefined;
    if (!slug) continue;
    const list = videosByCategory.get(slug) ?? [];
    list.push(video.id);
    videosByCategory.set(slug, list);
  }

  let touched = 0;
  const withoutHero: string[] = [];

  for (const category of categories) {
    const name = category.name;

    /* A field photograph of this category's own work: the first image of its
       first campaign. Categories carry no image of their own yet. */
    let heroImage = category.heroImage || category.image || "";
    if (!heroImage && category.campaignIds.length) {
      const campaign = await prisma.campaign.findFirst({
        where: { id: { in: category.campaignIds }, isActive: true, images: { isEmpty: false } },
        select: { images: true },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      });
      heroImage = campaign?.images?.[0] ?? "";
    }
    if (!heroImage) withoutHero.push(category.slug ?? category.id);

    const keep = <T>(current: T, next: T, isEmpty: (v: T) => boolean): T =>
      FORCE || isEmpty(current) ? next : current;
    const emptyText = (v: string | null) => !v || !v.trim();

    const data = {
      heroImage: keep(category.heroImage, heroImage || null, emptyText),
      /* States what the page is. No claim about the work — those belong to the
         values and the cards, which a person writes. */
      heroLead: keep(category.heroLead, `مشاريع مؤسسة منبر الأقصى الدولية في ${name}.`, emptyText),
      ctaLabel: keep(category.ctaLabel, "تصفّح المشاريع", emptyText),
      projectsTitle: keep(category.projectsTitle, `مشاريع ${name}`, emptyText),
      donateTitle: keep(category.donateTitle, `ساهم في ${name}`, emptyText),
      achievementsTitle: keep(category.achievementsTitle, `إنجازاتنا في ${name}`, emptyText),
      suggestedAmounts:
        FORCE || category.suggestedAmounts.length === 0 ? AMOUNTS : category.suggestedAmounts,
      achievementVideoIds:
        FORCE || category.achievementVideoIds.length === 0
          ? videosByCategory.get(category.slug ?? "") ?? category.achievementVideoIds
          : category.achievementVideoIds,
      pageTemplate: keep(category.pageTemplate, PAGE_TEMPLATES[category.slug ?? ""] ?? null, emptyText),
    };

    if (DRY) {
      console.log(`  · ${category.slug}: hero=${data.heroImage ? "yes" : "—"} videos=${data.achievementVideoIds.length}`);
      continue;
    }

    await prisma.category.update({ where: { id: category.id }, data });
    touched += 1;
    console.log(
      `  ✓ ${category.slug ?? category.id} — hero ${data.heroImage ? "set" : "none"}, ` +
        `${data.achievementVideoIds.length} achievement video(s)`
    );
  }

  await seedBoundCategories();

  console.log(`\n${DRY ? "would update" : "updated"} ${DRY ? categories.length : touched} categories`);
  if (withoutHero.length) {
    console.log(`no photograph available for: ${withoutHero.join(", ")}`);
    console.log("  (their campaigns carry no image; upload one in the dashboard)");
  }
  console.log(
    "left for an editor — they are claims, not derivable data:\n" +
      "  · the figures band (done / goal)\n" +
      "  · the values strip\n" +
      "  · the three explanatory cards (why / what we do / the impact)"
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
