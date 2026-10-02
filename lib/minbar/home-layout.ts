/**
 * The homepage's arrangement, as the dashboard configures it
 * (`/dashboard/homepage-layout`): which sections show, in what order, and
 * for every section that lists things (events, reels, programmes, courses,
 * projects, categories, articles, news, FAQs) which items it shows and how
 * they are ranked.
 *
 * Not content. Every item is still written in its own dashboard page; this
 * document only picks and orders. Stored as one JSON document on
 * `GlobalSettings.homeLayout`; null means "the defaults below", and the
 * defaults reproduce the homepage exactly as it was before the setting existed.
 *
 * Pure  no Prisma, no React  so the same parse runs on the server (page
 * render, API) and in the browser (dashboard form). Same two strictnesses as
 * `quick-donation.ts`:
 *   · `parseHomeLayout` is TOLERANT. An unknown section is dropped, a section
 *     added to the code after the row was saved is slotted in at its default
 *     place, a bad list setting falls back to its default. A bad row must
 *     never blank the homepage.
 *   · `validateHomeLayoutBody` is STRICT. The dashboard's PUT is refused with
 *     a message when it would save something the page cannot honour.
 */

/* ── Sections ────────────────────────────────────────────────────────────── */

/**
 * The movable sections, in the approved design's order. The hero and the
 * quick-donation bar are not here: the bar is sticky "right under the hero"
 * by design, so those two stay at the top and are shown as locked rows.
 */
export const HOME_SECTION_IDS = [
  "verse",
  "bannersTop",
  "events",
  "reels",
  "path",
  "programs",
  "courses",
  "impact",
  "bannersMiddle",
  "travel",
  "ibadan",
  "urgent",
  "categories",
  "zakat",
  "waqf",
  "recurring",
  "regions",
  "account",
  "bannersBottom",
  "articles",
  "news",
  "faqs",
] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

/** The lists a section may own; each has its own pick-and-rank settings. */
export const HOME_LIST_IDS = [
  "events",
  "endorsements",
  "achievements",
  "programs",
  "courses",
  "projects",
  "categories",
  "articles",
  "news",
  "faqs",
] as const;
export type HomeListId = (typeof HOME_LIST_IDS)[number];

export type HomeSectionKind = "list" | "static" | "banners";

export interface HomeSectionMeta {
  label: string;
  description: string;
  kind: HomeSectionKind;
  /** The lists this section renders, in the order it renders them. */
  lists: HomeListId[];
  /** Where the section's items (or its own settings) are edited. */
  editHref?: string;
}

export const HOME_SECTIONS: Record<HomeSectionId, HomeSectionMeta> = {
  verse: { label: "شريط الآية", description: "آية الإسراء ورابط صفحة المسجد الأقصى.", kind: "static", lists: [] },
  bannersTop: { label: "البانرات — الموضع العلوي", description: "البانرات المنشورة على الصفحة الرئيسية في الموضع العلوي.", kind: "banners", lists: [], editHref: "/dashboard/urgent-banners" },
  events: { label: "فعالياتنا", description: "تسجيلات المؤتمرات والفعاليات. أضف فعالية جديدة من صفحة الفيديوهات بنوع «فعالياتنا».", kind: "list", lists: ["events"], editHref: "/dashboard/videos" },
  reels: { label: "تزكياتنا وإنجازاتنا", description: "شريطا فيديو التزكيات والإنجازات.", kind: "list", lists: ["endorsements", "achievements"], editHref: "/dashboard/videos" },
  path: { label: "كيف يصل تبرعك؟", description: "خطوات وصول التبرع ورابط التقارير.", kind: "static", lists: [] },
  programs: { label: "برامجنا", description: "البرامج المصورة (قوائم يوتيوب).", kind: "list", lists: ["programs"], editHref: "/dashboard/playlists" },
  courses: { label: "دوراتنا", description: "الدورات والندوات.", kind: "list", lists: ["courses"], editHref: "/dashboard/courses" },
  impact: { label: "أثرنا في القدس", description: "أرقام الأثر الرسمية.", kind: "static", lists: [] },
  bannersMiddle: { label: "البانرات — الموضع الأوسط", description: "البانرات المنشورة على الصفحة الرئيسية في الموضع الأوسط.", kind: "banners", lists: [], editHref: "/dashboard/urgent-banners" },
  travel: { label: "بانر شد الرحال", description: "بانر الجمعة وشد الرحال إلى الأقصى.", kind: "static", lists: [] },
  ibadan: { label: "بانر «عبادًا لنا»", description: "بانر برنامج عبادًا لنا وآية الإسراء ٥.", kind: "static", lists: [] },
  urgent: { label: "مشاريع عاجلة", description: "شريط المشاريع مع زر التبرع المباشر.", kind: "list", lists: ["projects"], editHref: "/dashboard/campaigns" },
  categories: { label: "الحملات والدول", description: "بطاقات الحملات والدول تحت المشاريع العاجلة.", kind: "list", lists: ["categories"], editHref: "/dashboard/categories" },
  zakat: { label: "بانر الزكاة", description: "بانر الزكاة وحاسبتها.", kind: "static", lists: [] },
  waqf: { label: "صندوق منبر الأقصى الوقفي", description: "قسم الوقف.", kind: "static", lists: [] },
  recurring: { label: "عطاء منتظم يستمر أثره", description: "قسم التبرع المتكرر.", kind: "static", lists: [] },
  regions: { label: "بطاقات المناطق", description: "مشاريع القدس، مشاريع الأقصى، والإغاثة العاجلة.", kind: "static", lists: [] },
  account: { label: "حسابك في منبر الأقصى", description: "دعوة إنشاء حساب أو تسجيل الدخول.", kind: "static", lists: [] },
  bannersBottom: { label: "البانرات — الموضع السفلي", description: "البانرات المنشورة على الصفحة الرئيسية في الموضع السفلي.", kind: "banners", lists: [], editHref: "/dashboard/urgent-banners" },
  articles: { label: "المدونة", description: "أحدث المقالات.", kind: "list", lists: ["articles"], editHref: "/dashboard/blog" },
  news: { label: "الأخبار", description: "أخبار المنبر.", kind: "list", lists: ["news"], editHref: "/dashboard/blog" },
  faqs: { label: "الأسئلة الشائعة", description: "الأسئلة الشائعة مع تصفية حسب الموضوع.", kind: "list", lists: ["faqs"], editHref: "/dashboard/faqs" },
};

/* ── Lists ───────────────────────────────────────────────────────────────── */

/**
 *   · auto    the first `limit` items, ranked by `sort`;
 *   · manual  exactly `ids`, in that order;
 *   · pinned  `ids` first, in that order, then the rest ranked by `sort`
 *             until `limit` is reached.
 */
export type HomeListMode = "auto" | "manual" | "pinned";
export const HOME_LIST_MODES: readonly HomeListMode[] = ["auto", "manual", "pinned"];

/**
 *   · default       the order the item's own dashboard page sets (the order
 *                   field, the project priority, newest-first for posts);
 *   · newest/oldest by creation time;
 *   · mostRaised    projects  the most money raised;
 *   · mostProgress  projects  the highest share of the goal reached;
 *   · mostProjects  categories  the most active projects.
 */
export type HomeListSort = "default" | "newest" | "oldest" | "mostRaised" | "mostProgress" | "mostProjects";

export const HOME_SORT_LABELS: Record<HomeListSort, string> = {
  default: "ترتيب لوحة التحكم",
  newest: "الأحدث أولًا",
  oldest: "الأقدم أولًا",
  mostRaised: "الأكثر تبرعات",
  mostProgress: "الأقرب لاكتمال الهدف",
  mostProjects: "الأكثر مشاريع",
};

export interface HomeListConfig {
  /** Off hides this list only (for a section with two lists, the reels). */
  show: boolean;
  mode: HomeListMode;
  sort: HomeListSort;
  /** How many to show; 0 = all of them. Ignored in manual mode. */
  limit: number;
  /** Item ids for manual and pinned modes, in priority order. */
  ids: string[];
}

export interface HomeListMeta {
  label: string;
  sorts: HomeListSort[];
  /** The count the homepage showed before this setting existed; 0 = all. */
  defaultLimit: number;
}

export const HOME_LISTS: Record<HomeListId, HomeListMeta> = {
  events: { label: "فعالياتنا", sorts: ["default", "newest"], defaultLimit: 3 },
  endorsements: { label: "تزكياتنا", sorts: ["default", "newest", "oldest"], defaultLimit: 8 },
  achievements: { label: "إنجازاتنا", sorts: ["default", "newest", "oldest"], defaultLimit: 5 },
  programs: { label: "برامجنا", sorts: ["default", "newest", "oldest"], defaultLimit: 0 },
  courses: { label: "دوراتنا", sorts: ["default", "newest", "oldest"], defaultLimit: 0 },
  projects: { label: "المشاريع العاجلة", sorts: ["default", "newest", "oldest", "mostRaised", "mostProgress"], defaultLimit: 12 },
  categories: { label: "الحملات والدول", sorts: ["default", "newest", "oldest", "mostProjects"], defaultLimit: 0 },
  articles: { label: "المقالات", sorts: ["newest", "oldest"], defaultLimit: 4 },
  news: { label: "الأخبار", sorts: ["newest", "oldest"], defaultLimit: 4 },
  faqs: { label: "الأسئلة الشائعة", sorts: ["default", "newest", "oldest"], defaultLimit: 0 },
};

/** The most any one list may show, so a typo cannot put 10 000 cards on the page. */
export const HOME_LIST_MAX_LIMIT = 60;
/** The most items a manual or pinned list may name. */
export const HOME_LIST_MAX_IDS = 60;

/**
 * The three conference recordings `فعالياتنا` showed before events were CMS
 * content. They stay selectable under these ids, ahead of the event videos.
 */
export const BUILTIN_EVENT_IDS = ["builtin:khatib", "builtin:conf3", "builtin:conf2"] as const;
export type BuiltinEventId = (typeof BUILTIN_EVENT_IDS)[number];
export const BUILTIN_EVENT_LABELS: Record<BuiltinEventId, string> = {
  "builtin:khatib": "كلمة خطيب المسجد الأقصى — المؤتمر الثالث",
  "builtin:conf3": "المؤتمر الثالث (قائمة تشغيل)",
  "builtin:conf2": "المؤتمر الثاني",
};
export function isBuiltinEventId(id: string): id is BuiltinEventId {
  return (BUILTIN_EVENT_IDS as readonly string[]).includes(id);
}

/* ── The document ────────────────────────────────────────────────────────── */

export interface HomeSectionSetting {
  id: HomeSectionId;
  enabled: boolean;
}

export interface HomeLayoutConfig {
  /** Every movable section exactly once, in display order. */
  sections: HomeSectionSetting[];
  lists: Record<HomeListId, HomeListConfig>;
}

export function defaultListConfig(id: HomeListId): HomeListConfig {
  const meta = HOME_LISTS[id];
  return { show: true, mode: "auto", sort: meta.sorts[0], limit: meta.defaultLimit, ids: [] };
}

export function defaultHomeLayout(): HomeLayoutConfig {
  return {
    sections: HOME_SECTION_IDS.map((id) => ({ id, enabled: true })),
    lists: Object.fromEntries(HOME_LIST_IDS.map((id) => [id, defaultListConfig(id)])) as Record<HomeListId, HomeListConfig>,
  };
}

export const DEFAULT_HOME_LAYOUT: HomeLayoutConfig = defaultHomeLayout();

const isSectionId = (v: unknown): v is HomeSectionId => typeof v === "string" && (HOME_SECTION_IDS as readonly string[]).includes(v);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function parseList(id: HomeListId, raw: unknown): HomeListConfig {
  const base = defaultListConfig(id);
  if (!isObject(raw)) return base;
  const meta = HOME_LISTS[id];
  const mode = HOME_LIST_MODES.includes(raw.mode as HomeListMode) ? (raw.mode as HomeListMode) : base.mode;
  const sort = meta.sorts.includes(raw.sort as HomeListSort) ? (raw.sort as HomeListSort) : base.sort;
  const n = Number(raw.limit);
  const limit = Number.isInteger(n) && n >= 0 ? Math.min(n, HOME_LIST_MAX_LIMIT) : base.limit;
  const ids = Array.isArray(raw.ids)
    ? [...new Set(raw.ids.filter((x): x is string => typeof x === "string" && x.trim() !== ""))].slice(0, HOME_LIST_MAX_IDS)
    : [];
  return { show: raw.show !== false, mode, sort, limit, ids };
}

/** Tolerant read: whatever is stored, a complete, renderable layout comes back. */
export function parseHomeLayout(raw: unknown): HomeLayoutConfig {
  const fallback = defaultHomeLayout();
  if (!isObject(raw)) return fallback;

  const seen = new Set<HomeSectionId>();
  const sections: HomeSectionSetting[] = [];
  if (Array.isArray(raw.sections)) {
    for (const s of raw.sections) {
      if (!isObject(s) || !isSectionId(s.id) || seen.has(s.id)) continue;
      seen.add(s.id);
      sections.push({ id: s.id, enabled: s.enabled !== false });
    }
  }
  /* A section the stored row does not know about (added to the code later)
     goes in right after the section that precedes it in the default order,
     so a new section lands where the design puts it, not at the bottom. */
  HOME_SECTION_IDS.forEach((id, index) => {
    if (seen.has(id)) return;
    seen.add(id);
    const before = HOME_SECTION_IDS.slice(0, index).reverse().find((prev) => sections.some((s) => s.id === prev));
    const at = before ? sections.findIndex((s) => s.id === before) + 1 : 0;
    sections.splice(at, 0, { id, enabled: true });
  });

  const lists = isObject(raw.lists) ? raw.lists : {};
  return {
    sections,
    lists: Object.fromEntries(HOME_LIST_IDS.map((id) => [id, parseList(id, lists[id])])) as Record<HomeListId, HomeListConfig>,
  };
}

/** Strict read for the PUT: throws a message the dashboard shows as-is. */
export function validateHomeLayoutBody(body: unknown): HomeLayoutConfig {
  if (!isObject(body)) throw new Error("الإعدادات غير صالحة");
  if (!Array.isArray(body.sections)) throw new Error("ترتيب الأقسام مفقود");
  const ids = body.sections.map((s) => (isObject(s) ? s.id : undefined));
  for (const id of ids) {
    if (!isSectionId(id)) throw new Error(`قسم غير معروف: ${String(id)}`);
  }
  if (new Set(ids).size !== ids.length) throw new Error("قسم مكرر في الترتيب");

  const lists = isObject(body.lists) ? body.lists : {};
  for (const id of HOME_LIST_IDS) {
    const raw = lists[id];
    if (raw === undefined) continue;
    if (!isObject(raw)) throw new Error(`إعدادات «${HOME_LISTS[id].label}» غير صالحة`);
    if (raw.mode !== undefined && !HOME_LIST_MODES.includes(raw.mode as HomeListMode)) throw new Error(`طريقة عرض غير معروفة في «${HOME_LISTS[id].label}»`);
    if (raw.sort !== undefined && !HOME_LISTS[id].sorts.includes(raw.sort as HomeListSort)) throw new Error(`ترتيب غير متاح في «${HOME_LISTS[id].label}»`);
    if (raw.limit !== undefined) {
      const n = Number(raw.limit);
      if (!Number.isInteger(n) || n < 0 || n > HOME_LIST_MAX_LIMIT) throw new Error(`عدد العناصر في «${HOME_LISTS[id].label}» يجب أن يكون بين 0 و${HOME_LIST_MAX_LIMIT}`);
    }
    if (raw.ids !== undefined && (!Array.isArray(raw.ids) || raw.ids.length > HOME_LIST_MAX_IDS)) {
      throw new Error(`يمكن اختيار ${HOME_LIST_MAX_IDS} عنصرًا على الأكثر في «${HOME_LISTS[id].label}»`);
    }
    if (raw.mode === "manual" && raw.show !== false && Array.isArray(raw.ids) && raw.ids.length === 0) {
      throw new Error(`اختر عنصرًا واحدًا على الأقل في «${HOME_LISTS[id].label}» أو غيّر طريقة العرض`);
    }
  }
  return parseHomeLayout(body);
}

/* ── Applying a list's settings ──────────────────────────────────────────── */

/**
 * Creation time of a MongoDB ObjectId, in ms. Every model here is keyed by
 * one, which gives "newest/oldest" for every list  including the categories
 * and programmes, which have no `createdAt` of their own  without a second
 * query. A non-ObjectId id (the built-in events) reads as the epoch: oldest.
 */
export function objectIdTime(id: string): number {
  return /^[0-9a-f]{24}$/i.test(id) ? parseInt(id.slice(0, 8), 16) * 1000 : 0;
}

export interface ListItemFacts {
  id: string;
  /** Overrides the id's own timestamp (posts carry their publication date). */
  createdAt?: number;
  raised?: number;
  /** 0–1; projects with no goal have none. */
  progress?: number;
  projectCount?: number;
}

function ranked<T>(items: T[], sort: HomeListSort, facts: (item: T) => ListItemFacts): T[] {
  if (sort === "default") return items;
  const time = (item: T) => facts(item).createdAt ?? objectIdTime(facts(item).id);
  const key: Record<Exclude<HomeListSort, "default">, (a: T, b: T) => number> = {
    newest: (a, b) => time(b) - time(a),
    oldest: (a, b) => time(a) - time(b),
    mostRaised: (a, b) => (facts(b).raised ?? 0) - (facts(a).raised ?? 0),
    mostProgress: (a, b) => (facts(b).progress ?? -1) - (facts(a).progress ?? -1),
    mostProjects: (a, b) => (facts(b).projectCount ?? 0) - (facts(a).projectCount ?? 0),
  };
  /* Array.prototype.sort is stable, so ties keep the dashboard's order. */
  return [...items].sort(key[sort]);
}

/**
 * The items one list shows, from every candidate in its dashboard order.
 * Ids that no longer resolve (deleted, deactivated, not in this locale) are
 * skipped, so a stale selection degrades to a shorter list, never an error.
 */
export function applyHomeList<T>(items: T[], config: HomeListConfig, facts: (item: T) => ListItemFacts): T[] {
  if (!config.show) return [];
  const byId = new Map(items.map((item) => [facts(item).id, item]));
  const picked = config.ids.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
  if (config.mode === "manual") return picked;

  const take = (list: T[]) => (config.limit > 0 ? list.slice(0, config.limit) : list);
  if (config.mode === "auto") return take(ranked(items, config.sort, facts));

  const pinned = new Set(picked);
  return take([...picked, ...ranked(items.filter((item) => !pinned.has(item)), config.sort, facts)]);
}

/**
 * Whether a list needs more than its default leading slice of candidates.
 * Posts are read newest-first with a `take`; only "the newest N" can be
 * served by reading exactly N.
 */
export function listNeedsFullPool(config: HomeListConfig): boolean {
  return config.mode !== "auto" || config.sort !== "newest" || config.limit === 0;
}
