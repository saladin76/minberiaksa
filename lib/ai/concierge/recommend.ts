import type { ConciergeIntent } from "./schema";

/**
 * Deterministic candidate selection. The model is handed the output of this
 * and may only pick from it — it never sees the whole catalog and never ranks
 * on signals of its own. Pure and unit-tested.
 *
 * Signals are the factual fields the CMS holds: active status, the campaign's
 * categories (region-* and type-* slugs), the admin's ordering (`priority`,
 * ascending = first), text matches on the localized title/summary, and the
 * fundraising mode. There is no "urgency" field on a campaign, so nothing here
 * can manufacture one.
 */

export interface CatalogCampaign {
  id: string;
  slug: string;
  title: string;
  summary: string;
  image: string | null;
  /** Category slugs the campaign is filed under (`region-gaza`, `type-waqf`, …). */
  categorySlugs: string[];
  categoryIds: string[];
  regionSlug: string | null;
  regionLabel: string | null;
  priority: number | null;
  raisedUSD: number;
  goalUSD: number | null;
  suggestedAmountsUSD: number[];
  supportsShares: boolean;
  sharePriceUSD: number | null;
  createdAt: number;
}

export interface CatalogCategory {
  id: string;
  slug: string;
  title: string;
  kind: "region" | "type" | "other";
  projectCount: number;
  canDonateDirectly: boolean;
}

export interface RankInput {
  intent: ConciergeIntent | null;
  region: string | null;
  amountUSD: number | null;
  /** Free text, for keyword matches against title/summary. */
  text: string | null;
  excludeIds?: readonly string[];
  /** The campaign the visitor is looking at, if any — always a candidate. */
  currentCampaignId?: string | null;
}

/** Which type-* categories each intent prefers, best first. */
const INTENT_TYPES: Partial<Record<ConciergeIntent, string[]>> = {
  sadaqah_jariyah: ["type-waqf", "type-sadaqah"],
  waqf: ["type-waqf"],
  zakat: ["type-zakat"],
  recurring: ["type-recurring", "type-sadaqah"],
  relief: ["type-sadaqah"],
  gift: ["type-sadaqah", "type-waqf"],
};

/** Words in a title/summary that mark a lasting-impact project. */
const JARIYAH_WORDS = /بئر|آبار|مسجد|مدرسة|مدارس|تعليم|مركز|بناء|ترميم|حفر|مياه|ماء|قرآن|تحفيظ|كفالة|well|water|mosque|school|education|build|restor|quran|orphan|kuyu|su\b|cami|okul|eğitim|inşa|puits|eau|mosquée|école|brunnen|wasser|moschee|schule|pozo|agua|mezquita|escuela|sumur|air\b|masjid|sekolah/i;
/** Words that mark relief work. */
const RELIEF_WORDS = /إغاث|طوارئ|عاجل|غذاء|طعام|سلة|سلال|خيام|خيمة|دواء|طبي|شتاء|نازح|لاجئ|relief|emergency|urgent|food|meal|basket|tent|medical|winter|refugee|displaced|acil|gıda|yemek|çadır|tıbbi|kış|mülteci|secours|urgence|nourriture|tente|hiver|nothilfe|lebensmittel|zelt|winter|emergencia|alimento|tienda|invierno|darurat|makanan|tenda|pengungsi/i;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function textScore(c: CatalogCampaign, text: string | null): number {
  if (!text) return 0;
  const hay = `${c.title} ${c.summary}`.toLowerCase();
  let hits = 0;
  for (const w of new Set(tokens(text))) if (hay.includes(w)) hits += 1;
  return Math.min(hits, 4) * 2;
}

export function scoreCampaign(c: CatalogCampaign, input: RankInput): number {
  let score = 0;
  const types = input.intent ? INTENT_TYPES[input.intent] ?? [] : [];
  types.forEach((slug, i) => {
    if (c.categorySlugs.includes(slug)) score += 10 - i * 3;
  });
  if (input.intent === "sadaqah_jariyah" && JARIYAH_WORDS.test(`${c.title} ${c.summary}`)) score += 6;
  if (input.intent === "relief" && RELIEF_WORDS.test(`${c.title} ${c.summary}`)) score += 6;
  /* A named place outweighs cause words: a donor who says "Gaza" means Gaza. */
  if (input.region && c.regionSlug === `region-${input.region}`) score += 20;
  else if (input.region && c.categorySlugs.includes(`region-${input.region}`)) score += 18;
  if (input.intent === "zakat" && c.categorySlugs.includes("type-zakat")) score += 4;
  score += textScore(c, input.text);
  /* A share-based project fits a stated budget when the budget buys at least one share. */
  if (input.amountUSD && c.supportsShares && c.sharePriceUSD) {
    if (input.amountUSD >= c.sharePriceUSD) score += 1;
    else score -= 6;
  }
  /* The admin's ordering, ascending: priority 1 beats priority 50. Kept small
     so it breaks ties rather than overriding relevance. */
  if (typeof c.priority === "number") score += Math.max(0, 3 - c.priority / 20);
  if (input.currentCampaignId && c.id === input.currentCampaignId) score += 5;
  return score;
}

export interface RankedCampaign {
  campaign: CatalogCampaign;
  score: number;
}

/**
 * The top `limit` campaigns for the input. When nothing matches the intent
 * (score ≤ 0 across the board) the admin's own ordering is returned instead,
 * so the visitor always gets real projects rather than an empty screen.
 */
export function rankCampaigns(catalog: readonly CatalogCampaign[], input: RankInput, limit = 3): RankedCampaign[] {
  const exclude = new Set(input.excludeIds ?? []);
  const scored = catalog
    .filter((c) => !exclude.has(c.id))
    .map((c) => ({ campaign: c, score: scoreCampaign(c, input) }))
    .sort((a, b) => b.score - a.score || (a.campaign.priority ?? 999) - (b.campaign.priority ?? 999) || b.campaign.createdAt - a.campaign.createdAt);
  const positive = scored.filter((s) => s.score > 0);
  return (positive.length ? positive : scored).slice(0, limit);
}

/** Categories worth offering for an intent, best first. */
export function rankCategories(categories: readonly CatalogCategory[], intent: ConciergeIntent | null, limit = 4): CatalogCategory[] {
  const prefer = intent ? INTENT_TYPES[intent] ?? [] : [];
  return [...categories]
    .filter((c) => c.projectCount > 0 || c.canDonateDirectly)
    .sort((a, b) => {
      const pa = prefer.indexOf(a.slug);
      const pb = prefer.indexOf(b.slug);
      const ra = pa === -1 ? 99 : pa;
      const rb = pb === -1 ? 99 : pb;
      if (ra !== rb) return ra - rb;
      if (a.kind !== b.kind) return a.kind === "type" ? -1 : 1;
      return b.projectCount - a.projectCount;
    })
    .slice(0, limit);
}

/** One cross-sell for a basket: the admin's list first, else the same region, never a repeat. */
export function pickCrossSell(
  catalog: readonly CatalogCampaign[],
  adminUpsellIds: readonly string[],
  justAddedId: string | null,
  cartIds: readonly string[]
): CatalogCampaign | null {
  const taken = new Set([...cartIds, ...(justAddedId ? [justAddedId] : [])]);
  for (const id of adminUpsellIds) {
    const c = catalog.find((x) => x.id === id);
    if (c && !taken.has(c.id)) return c;
  }
  const added = justAddedId ? catalog.find((x) => x.id === justAddedId) : null;
  if (added?.regionSlug) {
    const same = rankCampaigns(catalog, { intent: null, region: added.regionSlug.replace(/^region-/, ""), amountUSD: null, text: null, excludeIds: [...taken] }, 1);
    if (same[0]) return same[0].campaign;
  }
  return rankCampaigns(catalog, { intent: null, region: null, amountUSD: null, text: null, excludeIds: [...taken] }, 1)[0]?.campaign ?? null;
}
