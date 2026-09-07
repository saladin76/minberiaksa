/**
 * The impact report's figures, programmes, milestones and published documents —
 * carried from `Minbar/إنجازات وتقارير المؤسسة.dc.html`.
 *
 * The handoff's comment on the totals is a constraint, not decoration:
 * "الأرقام الرسمية المعتمدة من ملف إنجازات المؤسسة — لا تُعدَّل إلا بأرقام رسمية أحدث"
 * — these are the foundation's approved published figures and are only ever
 * replaced by newer approved ones. Nothing here is computed, estimated, or
 * rounded for effect.
 *
 * Only the numbers and the asset references live here. Every string is a key
 * into the reviewed `achievements` namespace.
 */

/** The two headline totals across the foundation's years of work. */
export const BIG_STATS: ReadonlyArray<{ count: number; labelKey: string }> = [
  { count: 936, labelKey: "bigProjects" },
  { count: 3026088, labelKey: "bigServices" },
];

/**
 * Per-sector totals. The large figure is beneficiaries; the small line is the
 * number of projects that reached them.
 */
export const SECTOR_STATS: ReadonlyArray<{ labelKey: string; projects: number; beneficiaries: number }> = [
  { labelKey: "secWaqf", projects: 37, beneficiaries: 436529 },
  { labelKey: "secHoly", projects: 201, beneficiaries: 1208675 },
  { labelKey: "secEdu", projects: 380, beneficiaries: 369371 },
  { labelKey: "secSocial", projects: 146, beneficiaries: 369931 },
  { labelKey: "secEcon", projects: 145, beneficiaries: 331850 },
  { labelKey: "secHealth", projects: 27, beneficiaries: 309732 },
];

/** The three full-bleed scenes, each a figure set against a field photograph. */
export const SCENES: ReadonlyArray<{
  id: string;
  count: number;
  /** Drive file id for the background photograph. */
  image: string;
  /** Key prefix in the `achievements` namespace: `<prefix>.label`, `.text`, `.chip`. */
  prefix: string;
  /** Which edge the copy sits against, before direction is applied. */
  side: "start" | "end";
  /** The gold treatment is reserved for Al-Quds, the foundation's first focus. */
  gold?: boolean;
}> = [
  { id: "gaza", count: 300000, image: "1KwE0HHp0b3rlI2f92G-6qi1lPCCcEpNA", prefix: "gaza1", side: "start" },
  { id: "gaza-water", count: 5000, image: "1xR1EQc1t04e9MU0KdEOK-sYx5qPKNw-h", prefix: "gaza2", side: "end" },
  { id: "quds", count: 2500, image: "1w3n8DABq9o4P_tCr-yFe9NCvMfGHEO5D", prefix: "quds", side: "start", gold: true },
];

/** The three Al-Quds metrics beneath the Al-Quds scene. */
export const QUDS_METRICS: ReadonlyArray<{ count: number; labelKey: string; noteKey: string }> = [
  { count: 3500, labelKey: "qm1Label", noteKey: "qm1Note" },
  { count: 2000, labelKey: "qm2Label", noteKey: "qm2Note" },
  { count: 1200, labelKey: "qm3Label", noteKey: "qm3Note" },
];

/** Testimonies gathered in the field, published with their speakers' consent. */
export const VOICES: ReadonlyArray<{ image: string; quoteKey: string; whoKey: string; whereKey: string }> = [
  { image: "1BVqS-NToZUkESGcFEnXb1tPhs6qvQOHQ", quoteKey: "v1Quote", whoKey: "v1Who", whereKey: "v1Where" },
  { image: "1cuaNUr0YAgACFmRPN4PqRe7NqQa8Dn1n", quoteKey: "v2Quote", whoKey: "v2Who", whereKey: "v2Where" },
  { image: "1G9eiM5DHIBUlcGpd-QM16dx91ZOepGFj", quoteKey: "v3Quote", whoKey: "v3Who", whereKey: "v3Where" },
  { image: "1V5oakKydOepP1upVzMJ_K9sWBsgSQ1dL", quoteKey: "v4Quote", whoKey: "v4Who", whereKey: "v4Where" },
];

/** The six programmes and their share of the foundation's resources. */
export const PROGRAMS: ReadonlyArray<{
  icon: string;
  titleKey: string;
  textKey: string;
  kpiKey: string;
  /** Percentage of resources. The shares sum to 100. */
  share: number;
}> = [
  { icon: "utensils", titleKey: "prog1Title", textKey: "prog1Text", kpiKey: "programsKpi1", share: 34 },
  { icon: "droplets", titleKey: "prog2Title", textKey: "prog2Text", kpiKey: "programsKpi2", share: 18 },
  { icon: "tent", titleKey: "prog3Title", textKey: "prog3Text", kpiKey: "programsKpi3", share: 16 },
  { icon: "graduation-cap", titleKey: "prog4Title", textKey: "prog4Text", kpiKey: "programsKpi4", share: 12 },
  { icon: "home", titleKey: "prog5Title", textKey: "prog5Text", kpiKey: "programsKpi5", share: 11 },
  { icon: "heart-pulse", titleKey: "prog6Title", textKey: "prog6Text", kpiKey: "programsKpi6", share: 9 },
];

/** The five response milestones, in order. */
export const MILESTONES: ReadonlyArray<{ whenKey: string; titleKey: string; textKey: string }> = [
  { whenKey: "ms1When", titleKey: "ms1Title", textKey: "ms1Text" },
  { whenKey: "ms2When", titleKey: "ms2Title", textKey: "ms2Text" },
  { whenKey: "ms3When", titleKey: "ms3Title", textKey: "ms3Text" },
  { whenKey: "ms4When", titleKey: "ms4Title", textKey: "ms4Text" },
  { whenKey: "ms5When", titleKey: "ms5Title", textKey: "ms5Text" },
];

/**
 * The published documents.
 *
 * These are the real PDFs from the handoff's `Minbar/src/`, served from
 * `public/minbar/reports/`. The design's own note is that a report appears here
 * only once the foundation's management has approved it — so this list is the
 * approved set, and nothing is listed as "coming soon".
 */
export const REPORTS: ReadonlyArray<{ titleKey: string; metaKey: string; file: string }> = [
  { titleKey: "report1Title", metaKey: "report1Meta", file: "rep-yearly.pdf" },
  { titleKey: "report2Title", metaKey: "report2Meta", file: "rep-brochure.pdf" },
  { titleKey: "report3Title", metaKey: "report3Meta", file: "prj-tahfiz.pdf" },
  { titleKey: "report4Title", metaKey: "report4Meta", file: "prj-kursi.pdf" },
  { titleKey: "report5Title", metaKey: "report5Meta", file: "prj-school.pdf" },
  { titleKey: "report6Title", metaKey: "report6Meta", file: "prj-families.pdf" },
];

/** Where the report PDFs are served from. */
export const REPORT_BASE = "/minbar/reports";

/** The hero photograph and the photograph behind the closing call. */
export const HERO_IMAGE = "16D72JzXMHbp72ZJCHHFWLjUYrmUX4ta1";
export const CLOSING_IMAGE = "1GKlH6yVXzxEmni6SolP1u2G5PgmXtyQ0";
