import { optionalInt, optionalStr, str } from "./translation-write";

/**
 * Shaping for the landing page a category owns.
 *
 * The category endpoints predate the site-content group and write their own
 * scalars and translations by hand; this only covers the page fields added on
 * top — the hero, the figures, the donation box, the values strip, the
 * explanatory cards and the achievements rail — so the existing name / slug /
 * image logic is untouched.
 *
 * The two child lists are replaced wholesale on save (`deleteMany` then
 * `create` inside the parent's nested write), the way every other content model
 * here handles its children: a save is one atomic operation and the stored list
 * is exactly what the editor last saw.
 */

/** The explanatory cards' original drawn glyphs, still stored by older cards. */
export const CATEGORY_CARD_ICON_KEYS = [
  "alert",
  "home",
  "heart",
  "hands",
  "book",
  "shield",
  "water",
  "users",
] as const;
export type CategoryCardIcon = string;

/**
 * A card's icon: one of the eight above, or any value a category's own icon
 * takes — a Lucide name, `custom:Mosque`, `flag:PS` — as `CategoryIconPicker`
 * writes them. The renderer resolves the name and falls back on its own for
 * anything it does not know, so only the shape is checked here. Empty means
 * the first drawn glyph, which is what the cards have always defaulted to.
 */
export function cardIcon(v: unknown): CategoryCardIcon {
  const s = str(v);
  if ((CATEGORY_CARD_ICON_KEYS as readonly string[]).includes(s)) return s;
  return /^[A-Za-z0-9][A-Za-z0-9:_\- ]{0,63}$/.test(s) ? s : "alert";
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** Ids that are not ObjectIds are dropped: Prisma rejects the whole write on a
 *  malformed one, so a single stale id would make the category unsaveable. */
function objectIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const id = str(v);
    if (OBJECT_ID.test(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Whole positive amounts, de-duplicated, in the order the editor gave them. */
function amounts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = optionalInt(v);
    if (n !== undefined && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 12);
}

const MAX_CURRENCY_OVERRIDES = 20;

/**
 * `{ EUR: [50, 100], ... }` — the per-currency exceptions. USD is the base list
 * and is dropped here rather than kept as a duplicate of `suggestedAmounts`;
 * a currency whose list comes out empty is dropped too, so an exception row
 * the editor added and never filled in does not blank that currency's chips.
 */
export function amountsByCurrency(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = str(k).toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || code === "USD") continue;
    const list = amounts(v);
    if (list.length) out[code] = list;
    if (Object.keys(out).length >= MAX_CURRENCY_OVERRIDES) break;
  }
  return out;
}

/** The page's own scalars. Only keys the request carried are returned, so a
 *  caller that knows nothing about the page leaves it exactly as it was. */
export function buildCategoryPagePatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const text = (key: string) => {
    if (body[key] !== undefined) patch[key] = optionalStr(body[key]) ?? null;
  };
  const int = (key: string) => {
    if (body[key] !== undefined) patch[key] = optionalInt(body[key]) ?? null;
  };

  for (const key of [
    "heroImage",
    "heroVideoUrl",
    "heroLead",
    "ctaLabel",
    "statDoneLabel",
    "statGoalLabel",
    "projectsTitle",
    "donateTitle",
    "donateNote",
    "achievementsTitle",
  ]) {
    text(key);
  }
  int("statDoneValue");
  int("statGoalValue");

  if (body.suggestedAmounts !== undefined) patch.suggestedAmounts = amounts(body.suggestedAmounts);
  if (body.suggestedByCurrency !== undefined) {
    const by = amountsByCurrency(body.suggestedByCurrency);
    patch.suggestedByCurrency = Object.keys(by).length ? by : null;
  }
  if (body.achievementVideoIds !== undefined) patch.achievementVideoIds = objectIds(body.achievementVideoIds);
  if (body.donateToCategory !== undefined) patch.donateToCategory = body.donateToCategory === true;
  if (body.donateCampaignId !== undefined) {
    const id = str(body.donateCampaignId);
    patch.donateCampaignId = OBJECT_ID.test(id) ? id : null;
  }
  return patch;
}

/** The translated half of the page, per locale — merged into the row the
 *  category endpoints already upsert for `name` / `description`. */
export const CATEGORY_PAGE_TRANSLATION_FIELDS = [
  "heroLead",
  "ctaLabel",
  "statDoneLabel",
  "statGoalLabel",
  "projectsTitle",
  "donateTitle",
  "donateNote",
  "achievementsTitle",
] as const;

export function categoryPageTranslation(t: Record<string, unknown> | null | undefined) {
  const out: Record<string, string | null> = {};
  if (!t || typeof t !== "object") return out;
  for (const key of CATEGORY_PAGE_TRANSLATION_FIELDS) {
    if (t[key] !== undefined) out[key] = optionalStr(t[key]) ?? null;
  }
  return out;
}

/* ── Children ────────────────────────────────────────────────────────────── */

export interface CategoryValueInput {
  label: string;
  order: number;
  translations?: { create: Array<{ locale: string; label: string }> };
}

export interface CategoryCardInput {
  icon: CategoryCardIcon;
  title: string;
  body: string;
  order: number;
  translations?: { create: Array<{ locale: string; title: string; body: string }> };
}

/** `{ [locale]: { field: value } }` → rows, skipping locales that say nothing. */
function childTranslations<K extends string>(
  raw: unknown,
  fields: readonly K[],
  required: K
): Array<Record<K, string> & { locale: string }> {
  const out: Array<Record<K, string> & { locale: string }> = [];
  if (!raw || typeof raw !== "object") return out;
  for (const [locale, value] of Object.entries(raw as Record<string, unknown>)) {
    if (locale === "ar" || !value || typeof value !== "object") continue;
    const t = value as Record<string, unknown>;
    if (!str(t[required])) continue;
    const row: Record<string, string> = { locale };
    for (const field of fields) row[field] = str(t[field]);
    out.push(row as Record<K, string> & { locale: string });
  }
  return out;
}

/**
 * The values strip. Rows without a label are dropped rather than rejected — an
 * empty trailing row is what an editor leaves behind after clicking "add" once
 * too often, not a mistake worth failing the save over.
 */
export function parseCategoryValues(raw: unknown): CategoryValueInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  const out: CategoryValueInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const label = str(v.label);
    if (!label) continue;
    const translations = childTranslations(v.translations, ["label"] as const, "label");
    out.push({
      label,
      order: out.length,
      ...(translations.length ? { translations: { create: translations } } : {}),
    });
  }
  return out;
}

/** The explanatory cards. A card needs at least a title to exist. */
export function parseCategoryCards(raw: unknown): CategoryCardInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  const out: CategoryCardInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const title = str(c.title);
    if (!title) continue;
    const translations = childTranslations(c.translations, ["title", "body"] as const, "title");
    out.push({
      icon: cardIcon(c.icon),
      title,
      body: str(c.body),
      order: out.length,
      ...(translations.length ? { translations: { create: translations } } : {}),
    });
  }
  return out;
}

/** The nested write for both child lists, or `{}` when neither was posted. */
export function categoryChildrenWrite(body: Record<string, unknown>) {
  const values = parseCategoryValues(body.values);
  const cards = parseCategoryCards(body.infoCards);
  return {
    ...(values !== undefined
      ? { values: { deleteMany: {}, ...(values.length ? { create: values } : {}) } }
      : {}),
    ...(cards !== undefined
      ? { infoCards: { deleteMany: {}, ...(cards.length ? { create: cards } : {}) } }
      : {}),
  };
}

/** Everything the edit form needs back, on top of the category's own fields. */
export const CATEGORY_PAGE_SELECT = {
  heroImage: true,
  heroVideoUrl: true,
  heroLead: true,
  ctaLabel: true,
  statDoneValue: true,
  statDoneLabel: true,
  statGoalValue: true,
  statGoalLabel: true,
  projectsTitle: true,
  donateTitle: true,
  donateNote: true,
  suggestedAmounts: true,
  suggestedByCurrency: true,
  donateToCategory: true,
  donateCampaignId: true,
  achievementsTitle: true,
  achievementVideoIds: true,
  values: {
    orderBy: { order: "asc" as const },
    select: { id: true, label: true, order: true, translations: { select: { locale: true, label: true } } },
  },
  infoCards: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      icon: true,
      title: true,
      body: true,
      order: true,
      translations: { select: { locale: true, title: true, body: true } },
    },
  },
} as const;
