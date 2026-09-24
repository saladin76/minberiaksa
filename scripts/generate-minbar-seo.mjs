#!/usr/bin/env node
/**
 * Emit per-locale SEO copy for every public locale, derived from the Minbar
 * handoff's own translated bundles rather than machine-translating here.
 *
 * Source : Minbar/i18n/<lang>/{homepage,about,contact,blog,projects,common,navigation}.json
 * Target : lib/seo-minbar.generated.ts
 *
 * This is the ONE source of institutional SEO for all 19 locales. It used to
 * cover only the 11 locales the handoff promoted, with the original 8 keeping
 * hand-written entries in `lib/seo.ts` — entries written for the organisation's
 * earlier Syria programme ("Syrian medical aid", "موثوق منذ 2011 … السوريين").
 * Those leaked into every page through `buildPageMetadata()`'s keyword fallback.
 * The handoff bundles carry the current Al-Quds / Al-Aqsa / Gaza copy for all
 * 19 languages, so every locale now comes from here and the split is gone
 * (`DEPLOYED_VS_DESIGN_AUDIT.md` § P0.3). `tests/integration-settings/
 * seo-legacy-contamination.test.ts` fails the build if the old terms return.
 *
 * `lib/seo.ts` types `LOCALE_SEO` as `Record<Locale, LocaleSEO>` deliberately —
 * enabling a public locale is a compile error until its SEO content exists.
 * Adding a locale means adding it to LOCALES/OG below and re-running.
 *
 * Re-run after `scripts/sync-minbar-messages.mjs`:  node scripts/generate-minbar-seo.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "Minbar/i18n";
const OUT = "lib/seo-minbar.generated.ts";

/** Every public locale, in the order of `lib/locales.ts`. */
const LOCALES = [
  "ar", "tr", "en", "fr", "de", "es", "id", "pt",
  "ur", "sq", "it", "nl", "sv", "no", "da", "ms", "ja", "zh", "hi",
];

/** OpenGraph locale tags for the same set. */
const OG = {
  ar: "ar_SA", tr: "tr_TR", en: "en_US", fr: "fr_FR", de: "de_DE", es: "es_ES",
  id: "id_ID", pt: "pt_BR",
  ur: "ur_PK", sq: "sq_AL", it: "it_IT", nl: "nl_NL", sv: "sv_SE",
  no: "nb_NO", da: "da_DK", ms: "ms_MY", ja: "ja_JP", zh: "zh_CN", hi: "hi_IN",
};

/**
 * Terms from the retired Syria programme. A bundle that still carries one is
 * refused outright rather than emitted — the point of a single source is that
 * the contamination cannot come back through it.
 */
const LEGACY_TERMS = [/syria/i, /syrian/i, /سوريا/, /سوري/, /سورية/, /suriye/i, /siria/i, /syrien/i, /síria/i, /syrie/i];

if (!existsSync(SRC)) {
  console.error(`[minbar-seo] source not found: ${SRC} — nothing to generate.`);
  process.exit(1);
}

const ns = (locale, name) =>
  JSON.parse(readFileSync(join(SRC, locale, `${name}.json`), "utf8"));

/** First non-empty value for a list of candidate keys. */
const pick = (bundle, ...keys) => {
  for (const k of keys) {
    const v = bundle[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

/**
 * A meta description has to actually describe. Several namespaces have no lead
 * paragraph, so `pick` lands on a bare nav label ("Blog") — too thin to ship as
 * a description, and Google rewrites it anyway. Anything under this length is
 * discarded in favour of the homepage lead.
 */
const MIN_DESCRIPTION = 60;
const describe = (candidate, fallback) =>
  candidate && candidate.length >= MIN_DESCRIPTION ? candidate : fallback;

/** Collapse to a single line and clip to a length search engines will show. */
const clip = (s, max) => {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
};

const entries = {};
const contaminated = [];

for (const locale of LOCALES) {
  const home = ns(locale, "homepage");
  const nav = ns(locale, "navigation");
  const common = ns(locale, "common");
  const about = ns(locale, "about");
  const contact = ns(locale, "contact");
  const blog = ns(locale, "blog");
  const projects = ns(locale, "projects");

  const siteName = pick(common, "orgOfficialName", "orgName") || "Minbar Al-Aqsa";
  const heroTitle = pick(home, "heroTitle");
  const heroLead = pick(home, "heroLead", "heroSubtitle");

  // Keywords come from the terms the localisation pass actually settled on for
  // this language (glossary-locked labels), not from translating an English
  // keyword list — which is the rule in DEVELOPER_HANDOFF §11.
  const keywords = [
    pick(nav, "projects"), pick(nav, "zakat"), pick(nav, "waqf"),
    pick(nav, "recurring"), pick(nav, "aqsa"), pick(nav, "jerusalem"),
    pick(common, "donate"), pick(common, "zakatCalculator"), pick(common, "sadaqah"),
    pick(common, "palestine"), pick(common, "donateNow"), pick(common, "zakatToPalestine"),
    siteName,
  ].filter(Boolean);

  entries[locale] = {
    siteName,
    title: clip(`${heroTitle} | ${siteName}`, 70),
    description: clip(heroLead, 165),
    keywords: [...new Set(keywords)],
    titleTemplate: `%s | ${siteName}`,
    campaigns: {
      title: clip(`${pick(nav, "projects")} | ${siteName}`, 70),
      description: clip(describe(pick(projects, "lead", "allProjectsLead", "intro"), heroLead), 165),
    },
    about: {
      title: clip(`${pick(nav, "about")} | ${siteName}`, 70),
      /* `about.mission` is the one-sentence mission statement — the truest
         description of the About page the bundle has. */
      description: clip(describe(pick(about, "lead", "intro", "missionLead", "mission"), heroLead), 165),
    },
    contact: {
      title: clip(`${pick(nav, "contact")} | ${siteName}`, 70),
      description: clip(describe(pick(contact, "lead", "intro"), heroLead), 165),
    },
    blog: {
      title: clip(`${pick(nav, "blog")} | ${siteName}`, 70),
      description: clip(describe(pick(blog, "lead", "intro"), heroLead), 165),
    },
  };

  const flat = JSON.stringify(entries[locale]);
  for (const term of LEGACY_TERMS) {
    if (term.test(flat)) contaminated.push(`${locale}: ${term}`);
  }
}

if (contaminated.length) {
  console.error(`[minbar-seo] refusing to write — legacy Syria terms in source bundles:\n  ${contaminated.join("\n  ")}`);
  process.exit(1);
}

const banner = `/**
 * GENERATED FILE — do not edit by hand.
 * Produced by \`scripts/generate-minbar-seo.mjs\` from the Minbar handoff's
 * per-language i18n bundles. Re-run that script instead of editing this.
 *
 * The single source of institutional SEO for all ${LOCALES.length} public locales.
 * \`lib/seo.ts\` re-exports it as \`LOCALE_SEO\` / \`OG_LOCALE_MAP\`.
 */
`;

const body = `${banner}
export const MINBAR_OG_LOCALES = ${JSON.stringify(OG, null, 2)} as const;

export const MINBAR_LOCALE_SEO = ${JSON.stringify(entries, null, 2)};
`;

writeFileSync(OUT, body, "utf8");
console.log(`[minbar-seo] wrote ${OUT} — ${LOCALES.length} locales`);
