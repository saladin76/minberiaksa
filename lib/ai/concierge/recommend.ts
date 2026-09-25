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

/**
 * What a visitor's own situation points to. "I'm in high school and can't
 * study" shares no word with an education project's title, so the themes
 * bridge the visitor's words to the projects that fit them — the way a
 * thoughtful person would suggest a students' project to a student.
 */
const THEMES: Array<{ trigger: RegExp; campaign: RegExp; weight: number }> = [
  { trigger: /ذاكر|مذاكر|امتحان|اختبار|ثانوي|جامع|دراس|مدرس|طالب|تعليم|شهادة|قرآن|قران|تحفيظ|thanaw|study|studies|exam|school|student|college|universit|homework|educat|qur.?an|tahfiz|sınav|okul|öğrenci|üniversite|ders|eğitim|kur.?an|hıfz|examen|étud|école|éducation|prüfung|schule|bildung|studi|estudi|escuela|educación|ujian|sekolah|kuliah|pendidikan|امتحان|پڑھائی|طالب|تعلیم/i, campaign: /تعليم|تعليمي|طلاب|طالب|مدرس|مدارس|دورات|دورة|تحفيظ|قرآن|كراسي|علم|جامع|منح|education|student|school|quran|scholar|course|learning|eğitim|öğrenci|okul|kur'an|éducation|étudiant|école|bildung|schüler|educación|estudiante|pendidikan|pelajar|sekolah/i, weight: 9 },
  { trigger: /مريض|مرض|علاج|مستشف|دكتور|طبيب|صح[ةه]|ألم|الم|تعب|sick|ill|hospital|doctor|health|surgery|medic|hasta|hastane|doktor|sağlık|malade|hôpital|santé|krank|arzt|enfermo|hospital|salud|sakit|rumah\s*sakit|بیمار|علاج/i, campaign: /طبي|صحي|صحة|علاج|مستشف|دواء|أدوية|عيادة|إسعاف|medical|health|clinic|medicine|hospital|treatment|tıbbi|sağlık|ilaç|médic|santé|hôpital|medizin|gesundheit|médico|salud|medis|kesehatan|obat/i, weight: 9 },
  { trigger: /جوع|جعان|أكل|طعام|غذاء|فقر|فقير|محتاج|ضيق|دين|ديون|قرض|فلوس|مصاريف|hungry|food|poor|poverty|broke|debt|loan|bills|rent|aç|yoksul|borç|kira|faim|pauvre|dette|hunger|arm|schulden|hambre|pobre|deuda|lapar|miskin|hutang|بھوک|غریب|قرض/i, campaign: /غذائ|طعام|وجبات|وجبة|سلال|سلة|خبز|إفطار|كفالة|أسر|عائلات|فقراء|food|meal|bread|basket|parcel|famil|relief|gıda|yemek|ekmek|aile|nourriture|repas|famille|lebensmittel|mahlzeit|familie|alimento|comida|familia|makanan|keluarga/i, weight: 8 },
  { trigger: /زواج|عرس|خطوب|عريس|عروس|زوج|أطفال|اطفال|طفل|ابني|بنتي|ولادي|عيال|يتيم|أيتام|ايتام|اليتامى|marriage|wedding|married|baby|child|kids|orphan|my\s*son|my\s*daughter|evlilik|düğün|çocuk|yetim|mariage|enfant|orphelin|hochzeit|kind|waise|boda|hijo|niño|huérfano|pernikahan|anak|yatim|شادی|بچ|یتیم/i, campaign: /أيتام|يتيم|أطفال|طفل|أسر|عائلات|كفالة|orphan|child|famil|yetim|çocuk|aile|orphelin|enfant|famille|waise|kind|familie|huérfano|niño|familia|yatim|anak|keluarga/i, weight: 8 },
  { trigger: /شغل|وظيف|عمل|عاطل|بطالة|مشروعي|تجار|رزق|job|work|unemploy|business|career|salary|iş|işsiz|maaş|emploi|travail|chômage|arbeit|arbeitslos|trabajo|desemple|kerja|pengangguran|نوکری|روزگار/i, campaign: /تمكين|مشاريع\s*صغيرة|مشروع\s*صغير|حرف|تدريب|كفالة|أسر|livelihood|income|small\s*business|training|skills|geçim|meslek|eğitim|formation|revenu|ausbildung|einkommen|formación|ingreso|pelatihan|usaha/i, weight: 7 },
  { trigger: /ميت|توفي|توفى|وفاة|مات|فقدت|رحمه|رحمها|قبر|عزاء|died|passed\s*away|death|late\s*(father|mother)|deceased|grave|vefat|öldü|merhum|décéd|décès|verstorben|gestorben|fallec|murió|meninggal|almarhum|فوت|مرحوم/i, campaign: /وقف|صدقة\s*جارية|بئر|آبار|مسجد|مصحف|قرآن|type-waqf|jariyah|well|water|mosque|quran|vakıf|kuyu|cami|puits|mosquée|brunnen|moschee|pozo|mezquita|wakaf|sumur|masjid/i, weight: 9 },
];

/* A theme met in the title is what the project is; met only in the summary
   or its categories, it is a project that touches the theme — half weight,
   so "orphans" ranks the orphanage above every project that mentions families. */
function themeScore(c: CatalogCampaign, text: string | null): number {
  if (!text) return 0;
  const rest = `${c.summary} ${c.categorySlugs.join(" ")}`;
  let score = 0;
  for (const t of THEMES) {
    if (!t.trigger.test(text)) continue;
    if (t.campaign.test(c.title)) score += t.weight;
    else if (t.campaign.test(rest)) score += Math.ceil(t.weight / 2);
  }
  return score;
}

/* Arabic is folded so "للأيتام", "الأيتام" and "أيتام" meet "كفالة الأيتام":
   hamza forms and taa marbuta are unified and the attached particles
   (و، ف، ب، ك، ل، ال، لل، بال، كال) are stripped. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function stem(word: string): string {
  let w = word;
  w = w.replace(/^[وف](?=.{3,})/, "");
  w = w.replace(/^(بال|كال|لل|وال|فال)(?=.{3,})/, "ال");
  w = w.replace(/^[بكل](?=.{3,})/, "");
  w = w.replace(/^ال(?=.{3,})/, "");
  return w;
}

/* Words that say "I want to give to a project" rather than what the project
   is about — they would otherwise match every title on the site. */
const STOP = new Set([
  "مشروع", "مشاريع", "حمله", "حملات", "تبرع", "اتبرع", "تبرعات", "للتبرع", "عايز", "عاوز", "اريد", "ابغي", "حابب", "نفسي", "حاجه", "شيء", "مثل", "دعم", "مساعده", "اساعد", "اهل", "بعض", "زي", "علي", "الي", "هذا", "هذه",
  "project", "projects", "campaign", "campaigns", "donate", "donation", "donations", "give", "giving", "want", "would", "like", "something", "some", "thing", "help", "support", "please", "for", "the", "and", "with", "that", "this",
  "proje", "projeler", "bağış", "bağışlamak", "yapmak", "istiyorum", "için", "gibi", "yardım", "destek", "bir",
  "projet", "don", "donner", "faire", "veux", "pour", "quelque", "chose", "aider",
]);

function tokens(text: string): string[] {
  return norm(text)
    .split(/\s+/)
    .map(stem)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/* A whole word counts once; a long word met by its first five letters
   ("yetimlere" → "yetimhane", "students" → "student") counts too, so
   inflected forms in Turkish and English still reach the title. */
function hits(hay: string, text: string): number {
  const folded = norm(hay);
  let n = 0;
  for (const w of new Set(tokens(text))) {
    if (folded.includes(w)) n += 1;
    else if (w.length >= 7 && folded.includes(w.slice(0, 5))) n += 1;
  }
  return n;
}

/* A word in the title says what the project is; a word in the summary only
   that it comes up. Capped so a long message cannot outweigh a theme. */
function textScore(c: CatalogCampaign, text: string | null): number {
  if (!text) return 0;
  return Math.min(hits(c.title, text), 3) * 4 + Math.min(hits(c.summary, text), 2) * 2;
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
  score += themeScore(c, input.text);
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

/** How much a campaign is about what the visitor wrote — words and themes only, no intent or place. */
export function topicScore(c: CatalogCampaign, text: string): number {
  return textScore(c, text) + themeScore(c, text);
}

export interface TopicMatch {
  /** Campaigns that are about the visitor's words, best first (score > 0). */
  campaigns: RankedCampaign[];
  /** Areas that are about them: named in the text, or holding matching projects. Best first. */
  categories: Array<{ category: CatalogCategory; score: number; strong: boolean }>;
}

/**
 * What the visitor's words point at — one or more projects, or one or more
 * areas — so the reply can be as wide or as narrow as the wish: "orphans"
 * is an area, "the well in Gaza" is a project, "children" may be several
 * areas. Used when the model is off, and as the ground truth its choices are
 * checked against.
 */
export function matchTopic(campaigns: readonly CatalogCampaign[], categories: readonly CatalogCategory[], text: string): TopicMatch {
  const scored = campaigns
    .map((c) => ({ campaign: c, score: topicScore(c, text) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.campaign.priority ?? 999) - (b.campaign.priority ?? 999));
  const cats = categories
    .filter((c) => c.projectCount > 0 || c.canDonateDirectly)
    .map((category) => {
      const named = hits(category.title, text);
      const members = scored.filter((s) => s.campaign.categoryIds.includes(category.id));
      const viaProjects = members.reduce((sum, s) => sum + s.score, 0);
      const score = named * 10 + Math.min(viaProjects, 30);
      return { category, score, strong: named > 0 || members.some((m) => m.score >= 4) };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || b.category.projectCount - a.category.projectCount);
  return { campaigns: scored, categories: cats };
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
