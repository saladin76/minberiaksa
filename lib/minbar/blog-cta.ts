import type { MinbarRoute } from "@/lib/minbar/routes";

/**
 * Which of the eleven closing calls an article ends on.
 *
 * This lives outside `components/minbar/blog/ArticleCta.tsx` because that file
 * is a `"use client"` module: a function exported from it is a client
 * reference, and calling one from a server component throws
 * ("Attempted to call ctaKeyFor() from the server but ctaKeyFor is on the
 * client"). The article route needs the decision server-side to render, so the
 * pure part lives here and both sides import it.
 *
 * The key is derived from the CMS category **slug**, which is stable across
 * languages, with the handoff's Arabic name kept as a second chance for
 * categories created before slugs were required. `iman` — the general donation
 * call — is the fallback, exactly as it is in the handoff.
 */

/** The eleven calls, each naming the two routes it sends the reader to. */
export const CTA_ROUTES: Record<string, { primary: MinbarRoute; secondary: MinbarRoute }> = {
  waqf: { primary: "waqf", secondary: "jerusalem" },
  zakat: { primary: "zakat", secondary: "zakatCalculator" },
  orphans: { primary: "projects", secondary: "recurring" },
  gaza: { primary: "projects", secondary: "recurring" },
  water: { primary: "projects", secondary: "recurring" },
  ramadan: { primary: "recurring", secondary: "projects" },
  dhulhijjah: { primary: "projects", secondary: "zakat" },
  quran: { primary: "projects", secondary: "ibadanProject" },
  iman: { primary: "projects", secondary: "recurring" },
  family: { primary: "waqf", secondary: "projects" },
  trust: { primary: "about", secondary: "projects" },
};

/** Category slug fragments that identify each call. First match wins. */
const SLUG_HINTS: ReadonlyArray<[string, readonly string[]]> = [
  ["waqf", ["waqf", "endowment", "sadaqah-jariyah", "ongoing-charity"]],
  ["zakat", ["zakat"]],
  ["orphans", ["orphan", "solidarity", "takaful"]],
  ["gaza", ["gaza", "relief", "emergency", "food"]],
  ["water", ["water", "health", "medical", "sanitation"]],
  ["ramadan", ["ramadan"]],
  ["dhulhijjah", ["dhul", "hijjah", "qurbani", "udhiyah", "adahi"]],
  ["quran", ["quran", "education", "school", "childhood"]],
  ["family", ["family", "birr"]],
  ["trust", ["trust", "transparency", "institutional", "governance"]],
];

/** The handoff's own Arabic category names, for rows created without a slug. */
const ARABIC_NAMES: Record<string, string> = {
  "الأوقاف والصدقة الجارية": "waqf",
  "الزكاة والصدقات": "zakat",
  "الأيتام والتكافل": "orphans",
  "غزة والإغاثة": "gaza",
  "المياه والصحة": "water",
  رمضان: "ramadan",
  "ذو الحجة والأضاحي": "dhulhijjah",
  "القرآن والعبادات": "quran",
  "إيمانيات وتزكية": "iman",
  "الأسرة والبر": "family",
  "الثقة والشفافية والعمل المؤسسي": "trust",
};

/** Which of the eleven calls fits this article. */
export function ctaKeyFor(categorySlug?: string | null, categoryName?: string | null): string {
  const slug = (categorySlug || "").toLowerCase();
  if (slug) {
    for (const [key, hints] of SLUG_HINTS) {
      if (hints.some((hint) => slug.includes(hint))) return key;
    }
  }
  const byName = categoryName ? ARABIC_NAMES[categoryName.trim()] : undefined;
  return byName ?? "iman";
}
