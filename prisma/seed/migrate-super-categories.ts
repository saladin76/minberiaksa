/**
 * prisma/seed/migrate-super-categories.ts — move the ʿIbādan Lanā programme
 * page out of code and into the database as a super category.
 *
 * The page was `components/minbar/projects/IbadanPage.tsx`: a hand-written hero
 * with the verse, a project grid, the launch film, three press panels and the
 * documentary series, with every string in the `projects` namespace of the 19
 * i18n bundles and the press URLs hard-coded in the component. This copies all
 * of it — Arabic on the row, the other eighteen languages as translations,
 * read straight from `i18n/messages/*.json` — so the page is now a row an
 * editor can change.
 *
 * Nothing is invented. The verse, its translations and the translation's
 * attribution come from the `quran` namespace and `lib/minbar/quran.ts`; the
 * images are the files the component pointed at; the two YouTube ids and the
 * three press links are the ones it carried.
 *
 * The one thing that does not carry over is the campaign grid, and it carried
 * nothing to begin with: the component filtered the catalogue by the category
 * slug `ibadan`, and no such category exists, so the grid has been rendering
 * its empty state. The block is created so the section keeps its place and its
 * anchor; which campaigns belong in it is now a choice in the dashboard rather
 * than a category that has to be named exactly right.
 *
 * Idempotent: upsert on the slug, and the children are replaced with what this
 * file says. Re-running updates; it never duplicates.
 *
 *   npx tsx prisma/seed/migrate-super-categories.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const MESSAGES_DIR = path.join(process.cwd(), "i18n", "messages");

type Namespace = Record<string, string>;
type Messages = Record<string, unknown>;

function readMessages(locale: string): Messages {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as Messages;
}

const LOCALES = fs
  .readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

/** Copied from `lib/minbar/quran.ts` — the attribution shown under a translation. */
const QURAN_ATTRIBUTION: Record<string, string> = {
  ar: "ترجمة معاني القرآن الكريم — مجمع الملك فهد لطباعة المصحف الشريف",
  en: "Translation of the meanings of the Qur'an — King Fahd Complex for the Printing of the Holy Qur'an",
  tr: "Kur'an-ı Kerim meali — Kral Fahd Mushaf-ı Şerif Basım Kompleksi",
  fr: "Traduction des sens du Noble Coran — Complexe du Roi Fahd pour l'impression du Saint Coran",
  de: "Übersetzung der Bedeutungen des Korans — König-Fahd-Komplex für den Druck des Edlen Korans",
  es: "Traducción de los significados del Corán — Complejo del Rey Fahd para la impresión del Sagrado Corán",
  id: "Terjemahan makna Al-Qur'an — Kompleks Raja Fahd untuk Pencetakan Mushaf Al-Qur'an",
  pt: "Tradução dos significados do Alcorão — Complexo do Rei Fahd para a Impressão do Alcorão Sagrado",
  ur: "قرآن کریم کے معانی کا ترجمہ — شاہ فہد قرآن کریم پرنٹنگ کمپلیکس",
  sq: "Përkthimi i kuptimeve të Kuranit — Kompleksi i Mbretit Fahd për Shtypjen e Kuranit Fisnik",
  it: "Traduzione dei significati del Corano — Complesso di Re Fahd per la stampa del Nobile Corano",
  nl: "Vertaling van de betekenissen van de Koran — Koning Fahd-complex voor het drukken van de Edele Koran",
  sv: "Översättning av Koranens innebörd — Kung Fahd-komplexet för tryckning av den ädla Koranen",
  no: "Oversettelse av Koranens betydninger — Kong Fahd-komplekset for trykking av den edle Koranen",
  da: "Oversættelse af Koranens betydninger — Kong Fahd-komplekset for trykning af den ædle Koran",
  ms: "Terjemahan makna Al-Qur'an — Kompleks Raja Fahd untuk Percetakan Mushaf Al-Qur'an",
  ja: "クルアーンの意味の翻訳 — 聖クルアーン印刷のためのキング・ファハド・コンプレックス",
  zh: "古兰经含义译文 — 法赫德国王古兰经印刷厂",
  hi: "क़ुरआन के अर्थों का अनुवाद — किंग फ़हद पवित्र क़ुरआन मुद्रण परिसर",
};

/* Values the component carried in its own source. */
const SLUG = "ibadan-lana";
const HERO_IMAGE = "/minbar/assets/ibadan-hero.jpg";
const LOGO_AR = "/minbar/assets/ibadan-logo.jpg";
const LOGO_LATIN = "/minbar/assets/ibadan-logo-en.png";
const ACCENT = "#7C2318";
const INTRO_VIDEO = "0TKV80zde2I";
const LAUNCH_VIDEO = "hRaECN_ZLa4";
const PLAYLIST_SLUG = "ibadan";

/** The three press panels, with the article each pointed at. */
const PRESS = [
  { eyebrow: "ibadanEyebrow1", title: "ibadanNews1Title", body: "ibadanNews1Body", cta: "ibadanReadReport", url: "https://raissouni.com/5410" },
  { eyebrow: "ibadanEyebrow2", title: "ibadanNews2Title", body: "ibadanNews2Body", cta: "ibadanReadNews", url: "https://www.msf-online.com/أبرزهم-الريسوني-نخبة-من-علماء-الأمة-ي/" },
  { eyebrow: "ibadanEyebrow3", title: "ibadanNews3Title", body: "ibadanNews3Body", cta: "ibadanReadNews", url: "https://raissouni.com/5410" },
] as const;

async function main() {
  const ar = readMessages("ar");
  const arProjects = (ar.projects ?? {}) as Namespace;
  const arQuran = (ar.quran ?? {}) as Record<string, { ar?: string; t?: string }>;
  const verse = arQuran.isra_5 ?? {};

  const playlist = await prisma.videoPlaylist.findUnique({
    where: { slug: PLAYLIST_SLUG },
    select: { id: true, title: true },
  });
  if (!playlist) {
    console.warn(`  ! no playlist with slug "${PLAYLIST_SLUG}" — the series block will be created without one`);
  }

  /* ── Parent translations ─────────────────────────────────────────────── */
  const translations = LOCALES.filter((l) => l !== "ar").flatMap((locale) => {
    const messages = readMessages(locale);
    const p = (messages.projects ?? {}) as Namespace;
    const q = ((messages.quran ?? {}) as Record<string, { t?: string }>).isra_5 ?? {};
    const title = p.ibadanHeroTitle?.trim();
    if (!title) return [];
    return [
      {
        locale,
        title,
        intro: p.ibadanHeroIntro ?? null,
        verseTranslation: q.t ?? null,
        verseAttribution: q.t ? QURAN_ATTRIBUTION[locale] ?? QURAN_ATTRIBUTION.en : null,
        /* The Arabic wordmark is calligraphy; every other edition has the Latin
           lockup, which is what the component switched on `locale === "ar"`. */
        logoImage: LOGO_LATIN,
        ctaPrimaryLabel: p.ibadanCtaDonate ?? null,
        ctaSecondaryLabel: p.ibadanCtaLaunch ?? null,
        ctaTertiaryLabel: p.ibadanCtaSeries ?? null,
        metaTitle: title,
        metaDescription: (p.ibadanHeroIntro ?? "").slice(0, 165) || null,
      },
    ];
  });

  /* ── Blocks, in the order the page rendered them ─────────────────────── */
  const blockTranslations = (pick: (p: Namespace) => Record<string, string | null>) =>
    LOCALES.filter((l) => l !== "ar").flatMap((locale) => {
      const p = (readMessages(locale).projects ?? {}) as Namespace;
      const row = pick(p);
      if (!Object.values(row).some((v) => v && v.trim())) return [];
      return [{ locale, ...row }];
    });

  const blocks = [
    {
      kind: "CAMPAIGNS" as const,
      anchor: "bundle",
      order: 0,
      isActive: true,
      maxItems: null,
    },
    {
      kind: "VIDEO" as const,
      anchor: "launch-video",
      youtubeId: LAUNCH_VIDEO,
      title: arProjects.ibadanCtaLaunch ?? null,
      order: 1,
      isActive: true,
      translations: {
        create: blockTranslations((p) => ({ title: p.ibadanCtaLaunch ?? null })),
      },
    },
    ...PRESS.map((item, index) => ({
      kind: "TEXT" as const,
      anchor: index === 0 ? "launch-report" : null,
      eyebrow: arProjects[item.eyebrow] ?? null,
      title: arProjects[item.title] ?? null,
      body: arProjects[item.body] ?? null,
      linkLabel: arProjects[item.cta] ?? null,
      linkUrl: item.url,
      order: 2 + index,
      isActive: true,
      translations: {
        create: blockTranslations((p) => ({
          eyebrow: p[item.eyebrow] ?? null,
          title: p[item.title] ?? null,
          body: p[item.body] ?? null,
          linkLabel: p[item.cta] ?? null,
        })),
      },
    })),
    {
      kind: "PLAYLIST_EPISODES" as const,
      anchor: "series",
      refId: playlist?.id ?? null,
      title: arProjects.ibadanSeriesTitle ?? null,
      subtitle: arProjects.ibadanSeriesSub ?? null,
      order: 2 + PRESS.length,
      isActive: true,
      translations: {
        create: blockTranslations((p) => ({
          title: p.ibadanSeriesTitle ?? null,
          subtitle: p.ibadanSeriesSub ?? null,
        })),
      },
    },
  ];

  const scalars = {
    title: arProjects.ibadanHeroTitle ?? "مشروع «عبادًا لنا»",
    intro: arProjects.ibadanHeroIntro ?? null,
    verseArabic: verse.ar ?? null,
    /* Arabic is the source, not a translation of itself — the component showed
       no translation line and no attribution in an Arabic session. */
    verseTranslation: null,
    verseAttribution: null,
    heroImage: HERO_IMAGE,
    logoImage: LOGO_AR,
    accentColor: ACCENT,
    heroVideoId: INTRO_VIDEO,
    /* The introductory film is an Arabic recording with no subtitled cut. */
    heroVideoLocales: ["ar"],
    ctaPrimaryLabel: arProjects.ibadanCtaDonate ?? null,
    ctaPrimaryHref: "#bundle",
    ctaSecondaryLabel: arProjects.ibadanCtaLaunch ?? null,
    ctaSecondaryHref: "#launch-video",
    ctaTertiaryLabel: arProjects.ibadanCtaSeries ?? null,
    ctaTertiaryHref: "#series",
    metaTitle: arProjects.ibadanHeroTitle ?? null,
    metaDescription: (arProjects.ibadanHeroIntro ?? "").slice(0, 165) || null,
    order: 0,
    isActive: true,
  };

  const existing = await prisma.superCategory.findUnique({ where: { slug: SLUG }, select: { id: true } });

  if (existing) {
    await prisma.superCategory.update({
      where: { id: existing.id },
      data: {
        ...scalars,
        translations: { deleteMany: {}, create: translations },
        blocks: { deleteMany: {}, create: blocks },
      },
    });
    console.log(`  ↻ updated super category "${SLUG}"`);
  } else {
    await prisma.superCategory.create({
      data: {
        slug: SLUG,
        ...scalars,
        translations: { create: translations },
        blocks: { create: blocks },
      },
    });
    console.log(`  + created super category "${SLUG}"`);
  }

  console.log(`    ${translations.length} translations, ${blocks.length} blocks`);
  console.log(`    series: ${playlist ? playlist.title : "— none linked"}`);
  console.log("    campaigns: none linked (pick them in the dashboard — the old category filter matched nothing)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
