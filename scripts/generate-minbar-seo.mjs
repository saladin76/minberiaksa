#!/usr/bin/env node
/**
 * Emit per-locale SEO copy for the locales the Minbar handoff added, derived
 * from its own translated bundles rather than machine-translating here.
 *
 * Source : Minbar/i18n/<lang>/{homepage,about,contact,blog,projects,common,navigation}.json
 * Target : lib/seo-minbar.generated.ts
 *
 * `lib/seo.ts` types `LOCALE_SEO` as `Record<Locale, LocaleSEO>` deliberately —
 * enabling a public locale is a compile error until its SEO content exists. This
 * generator fills that in for the 11 locales promoted with the handoff, so the
 * guard keeps working instead of being weakened to a Partial.
 *
 * Re-run after `scripts/sync-minbar-messages.mjs`:  node scripts/generate-minbar-seo.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "Minbar/i18n";
const OUT = "lib/seo-minbar.generated.ts";

/** The locales this file is responsible for — the ones `lib/seo.ts` lacked. */
const LOCALES = ["ur", "sq", "it", "nl", "sv", "no", "da", "ms", "ja", "zh", "hi"];

/** OpenGraph locale tags for the same set. */
const OG = {
  ur: "ur_PK", sq: "sq_AL", it: "it_IT", nl: "nl_NL", sv: "sv_SE",
  no: "nb_NO", da: "da_DK", ms: "ms_MY", ja: "ja_JP", zh: "zh_CN", hi: "hi_IN",
};

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
      description: clip(describe(pick(about, "lead", "intro", "missionLead"), heroLead), 165),
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
}

const banner = `/**
 * GENERATED FILE — do not edit by hand.
 * Produced by \`scripts/generate-minbar-seo.mjs\` from the Minbar handoff's
 * per-language i18n bundles. Re-run that script instead of editing this.
 *
 * Covers the ${LOCALES.length} locales promoted to public with the Minbar design port;
 * the original 8 keep their hand-written entries in \`lib/seo.ts\`.
 */
`;

const body = `${banner}
export const MINBAR_OG_LOCALES = ${JSON.stringify(OG, null, 2)} as const;

export const MINBAR_LOCALE_SEO = ${JSON.stringify(entries, null, 2)};
`;

writeFileSync(OUT, body, "utf8");
console.log(`[minbar-seo] wrote ${OUT} — ${LOCALES.length} locales`);
