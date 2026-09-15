/**
 * Where a dashboard banner can appear on the public site.
 *
 * A placement is `"<page>:<slot>"`. The dashboard offers exactly the pairs
 * listed here and nothing else, and every pair here is mounted by a page under
 * `app/[locale]` — so an editor is never offered a slot that renders nowhere.
 * Adding a page means adding it here AND mounting `<PageBanners>` on it.
 *
 * `all` is a pseudo-page: a banner placed on `all:top` shows in the top slot
 * of every page that has one. It is resolved at read time
 * (`lib/minbar/banners.ts`), never stored expanded.
 *
 * Pure module — shared by the dashboard form, the API and the site.
 */

export type BannerSlotKey = "top" | "middle" | "bottom";

export interface BannerSlot {
  key: BannerSlotKey;
  label: string;
}

export interface BannerPage {
  key: string;
  label: string;
  slots: BannerSlot[];
}

const TOP: BannerSlot = { key: "top", label: "أعلى الصفحة — قبل المحتوى" };
const BOTTOM: BannerSlot = { key: "bottom", label: "أسفل الصفحة — قبل التذييل" };

export const BANNER_PAGES: readonly BannerPage[] = [
  {
    key: "home",
    label: "الصفحة الرئيسية",
    slots: [
      { key: "top", label: "بعد الآية — قبل المشاريع العاجلة" },
      { key: "middle", label: "وسط الصفحة — قبل شدّ الرحال" },
      { key: "bottom", label: "أسفل الصفحة — قبل المدونة" },
    ],
  },
  { key: "projects", label: "المشاريع", slots: [TOP, BOTTOM] },
  { key: "projectDetail", label: "صفحة المشروع", slots: [TOP, BOTTOM] },
  { key: "zakat", label: "الزكاة", slots: [TOP, BOTTOM] },
  { key: "waqf", label: "الأوقاف", slots: [TOP, BOTTOM] },
  { key: "recurring", label: "التبرع الدوري", slots: [TOP, BOTTOM] },
  { key: "aqsa", label: "المسجد الأقصى", slots: [TOP, BOTTOM] },
  { key: "jerusalem", label: "القدس والبلدة القديمة", slots: [TOP, BOTTOM] },
  { key: "reports", label: "الإنجازات والتقارير", slots: [TOP, BOTTOM] },
  { key: "blog", label: "المدونة", slots: [TOP, BOTTOM] },
  { key: "article", label: "صفحة المقال", slots: [TOP, BOTTOM] },
  { key: "news", label: "الأخبار", slots: [TOP, BOTTOM] },
  { key: "courses", label: "الدورات", slots: [TOP, BOTTOM] },
  { key: "programs", label: "البرامج المصورة", slots: [TOP, BOTTOM] },
  { key: "about", label: "من نحن", slots: [TOP, BOTTOM] },
  { key: "cart", label: "السلة", slots: [TOP, BOTTOM] },
  { key: "all", label: "كل الصفحات", slots: [{ key: "top", label: "أعلى كل صفحة" }, { key: "bottom", label: "أسفل كل صفحة" }] },
];

export const BANNER_TONES = [
  { key: "red", label: "أحمر المنبر" },
  { key: "navy", label: "كحلي" },
  { key: "gold", label: "ذهبي" },
  { key: "green", label: "أخضر الزكاة" },
] as const;
export type BannerTone = (typeof BANNER_TONES)[number]["key"];

export const BANNER_TEXT_SIDES = [
  { key: "start", label: "بداية السطر (يمين في العربية)" },
  { key: "end", label: "نهاية السطر (يسار في العربية)" },
] as const;
export type BannerTextSide = (typeof BANNER_TEXT_SIDES)[number]["key"];

export function placementKey(page: string, slot: BannerSlotKey): string {
  return `${page}:${slot}`;
}

const VALID = new Set(BANNER_PAGES.flatMap((p) => p.slots.map((s) => placementKey(p.key, s.key))));

/** Keep only placements the catalogue knows, de-duplicated, in catalogue order. */
export function parsePlacements(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const picked = new Set(raw.filter((v): v is string => typeof v === "string" && VALID.has(v)));
  return [...VALID].filter((k) => picked.has(k));
}

export function isBannerTone(v: unknown): v is BannerTone {
  return BANNER_TONES.some((t) => t.key === v);
}
export function isBannerTextSide(v: unknown): v is BannerTextSide {
  return BANNER_TEXT_SIDES.some((t) => t.key === v);
}

/** "الصفحة الرئيسية · وسط الصفحة" for a stored placement, for the list page. */
export function describePlacement(key: string): string {
  const [page, slot] = key.split(":");
  const p = BANNER_PAGES.find((x) => x.key === page);
  const s = p?.slots.find((x) => x.key === slot);
  if (!p || !s) return key;
  return `${p.label} · ${s.label.split(" — ")[0]}`;
}
