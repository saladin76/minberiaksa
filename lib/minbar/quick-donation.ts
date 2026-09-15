import type { CartFreqKey } from "@/lib/minbar/cart";
import { SUPPORTED_LOCALES } from "@/lib/locales";

/**
 * The homepage quick-donation card, as the dashboard configures it.
 *
 * Stored as one JSON document on `GlobalSettings.quickDonation`; null means
 * "the defaults below". This module is pure — no Prisma, no React — so the
 * same parse runs on the server (page render, API) and in the browser
 * (dashboard form).
 *
 * Two readers, two strictnesses:
 *   · `parseQuickDonation` is TOLERANT. Whatever is in the database, the
 *     homepage renders something sensible — an unknown frequency is dropped,
 *     an empty preset list falls back to the defaults, a suggested index past
 *     the end is clamped. A bad row must never blank the donation card.
 *   · `validateQuickDonationBody` is STRICT. The dashboard's PUT is refused
 *     with a message when it would save something the card cannot show.
 *
 * Amounts are USD unless a currency override exists (`byCurrency`), the same
 * contract as the campaign form's suggested donations: the override is what a
 * visitor in that currency sees AND what goes to the cart, in that currency.
 */

/** The four frequencies, in the order the card shows them. */
export const QUICK_FREQUENCIES: readonly CartFreqKey[] = ["once", "daily", "friday", "monthly"];

/** The generic destinations, in the order the card shows them. */
export const QUICK_GENERIC_DESTINATIONS = ["where-needed", "zakat", "waqf", "gaza-relief"] as const;
export type QuickGenericDestination = (typeof QUICK_GENERIC_DESTINATIONS)[number];

export type QuickProjectsMode = "all" | "selected" | "none";

export interface QuickDonationConfig {
  /** The card is on the homepage at all. */
  enabled: boolean;
  /** The bottom dock that follows the card, per device. */
  dockDesktop: boolean;
  dockMobile: boolean;
  /** Presets in USD, 2–6 of them; ascending order is not enforced. */
  amounts: number[];
  /** Presets per currency code, replacing `amounts` for a visitor in that currency. */
  byCurrency: Record<string, number[]>;
  /** Index into the presets that is tagged "suggested" and preselected. */
  suggestedIndex: number;
  /** The "other amount" free field. */
  allowCustomAmount: boolean;
  /** Which frequencies to show; at least one; canonical order is applied. */
  frequencies: CartFreqKey[];
  defaultFrequency: CartFreqKey;
  /** Which generic intentions to show; canonical order is applied. */
  genericDestinations: QuickGenericDestination[];
  /** Which projects join the select under the intentions. */
  projectsMode: QuickProjectsMode;
  /** Campaign ids (not slugs — slugs differ per locale) when `projectsMode` is "selected". */
  projectIds: string[];
  /** A generic id or a campaign id; "" = the first option shown. */
  defaultDestination: string;
  /** Optional title per locale; a missing or empty one uses the site copy. */
  titles: Record<string, string>;
}

export const DEFAULT_QUICK_DONATION: QuickDonationConfig = {
  enabled: true,
  dockDesktop: true,
  dockMobile: true,
  amounts: [100, 300, 500, 700],
  byCurrency: {},
  suggestedIndex: 1,
  allowCustomAmount: true,
  frequencies: [...QUICK_FREQUENCIES],
  defaultFrequency: "once",
  genericDestinations: [...QUICK_GENERIC_DESTINATIONS],
  projectsMode: "all",
  projectIds: [],
  defaultDestination: "where-needed",
  titles: {},
};

export const QUICK_MIN_AMOUNTS = 2;
export const QUICK_MAX_AMOUNTS = 6;
const MAX_CURRENCY_OVERRIDES = 20;
const MAX_PROJECT_IDS = 200;
const MAX_TITLE = 80;

const isFreq = (v: unknown): v is CartFreqKey => QUICK_FREQUENCIES.includes(v as CartFreqKey);
const isGeneric = (v: unknown): v is QuickGenericDestination =>
  QUICK_GENERIC_DESTINATIONS.includes(v as QuickGenericDestination);
const isMode = (v: unknown): v is QuickProjectsMode => v === "all" || v === "selected" || v === "none";

function amountsOf(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === "number" ? x : Number(x);
    if (!Number.isFinite(n) || n <= 0) continue;
    const r = Math.round(n * 100) / 100;
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

function byCurrencyOf(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = String(k).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || code === "USD") continue;
    const arr = amountsOf(v);
    if (arr.length) out[code] = arr;
  }
  return out;
}

/** Keep the canonical order whatever order the list arrived in. */
function ordered<T>(canon: readonly T[], picked: readonly unknown[], guard: (v: unknown) => v is T): T[] {
  const set = new Set(picked.filter(guard));
  return canon.filter((c) => set.has(c));
}

function titlesOf(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(k)) continue;
    const s = typeof v === "string" ? v.trim().slice(0, MAX_TITLE) : "";
    if (s) out[k] = s;
  }
  return out;
}

function idsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const s = typeof x === "string" ? x.trim() : "";
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, MAX_PROJECT_IDS);
}

/** Coerce DB / API JSON into a config the card can always render. */
export function parseQuickDonation(raw: unknown): QuickDonationConfig {
  const d = DEFAULT_QUICK_DONATION;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...d, amounts: [...d.amounts], frequencies: [...d.frequencies], genericDestinations: [...d.genericDestinations] };
  }
  const o = raw as Record<string, unknown>;

  const amounts = amountsOf(o.amounts).slice(0, QUICK_MAX_AMOUNTS);
  const finalAmounts = amounts.length >= QUICK_MIN_AMOUNTS ? amounts : [...d.amounts];
  const byCurrency = byCurrencyOf(o.byCurrency);
  for (const k of Object.keys(byCurrency)) byCurrency[k] = byCurrency[k].slice(0, QUICK_MAX_AMOUNTS);

  const frequencies = ordered(QUICK_FREQUENCIES, Array.isArray(o.frequencies) ? o.frequencies : [], isFreq);
  const finalFreqs = frequencies.length ? frequencies : [...d.frequencies];
  const defaultFrequency =
    isFreq(o.defaultFrequency) && finalFreqs.includes(o.defaultFrequency) ? o.defaultFrequency : finalFreqs[0];

  const genericDestinations = ordered(
    QUICK_GENERIC_DESTINATIONS,
    Array.isArray(o.genericDestinations) ? o.genericDestinations : [],
    isGeneric
  );
  const projectsMode = isMode(o.projectsMode) ? o.projectsMode : d.projectsMode;

  const si = typeof o.suggestedIndex === "number" ? Math.trunc(o.suggestedIndex) : d.suggestedIndex;

  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : d.enabled,
    dockDesktop: typeof o.dockDesktop === "boolean" ? o.dockDesktop : d.dockDesktop,
    dockMobile: typeof o.dockMobile === "boolean" ? o.dockMobile : d.dockMobile,
    amounts: finalAmounts,
    byCurrency,
    suggestedIndex: Math.min(Math.max(si, 0), finalAmounts.length - 1),
    allowCustomAmount: typeof o.allowCustomAmount === "boolean" ? o.allowCustomAmount : d.allowCustomAmount,
    frequencies: finalFreqs,
    defaultFrequency,
    genericDestinations,
    projectsMode,
    projectIds: idsOf(o.projectIds),
    defaultDestination: typeof o.defaultDestination === "string" ? o.defaultDestination.trim() : d.defaultDestination,
    titles: titlesOf(o.titles),
  };
}

/**
 * Strict read of the dashboard's PUT body. Throws with a message the form
 * shows; returns the config to persist.
 */
export function validateQuickDonationBody(body: unknown): QuickDonationConfig {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid quickDonation");
  const o = body as Record<string, unknown>;

  const amounts = amountsOf(o.amounts);
  if (amounts.length < QUICK_MIN_AMOUNTS || amounts.length > QUICK_MAX_AMOUNTS) {
    throw new Error(`يلزم بين ${QUICK_MIN_AMOUNTS} و${QUICK_MAX_AMOUNTS} مبالغ مقترحة`);
  }
  const byCurrency = byCurrencyOf(o.byCurrency);
  if (Object.keys(byCurrency).length > MAX_CURRENCY_OVERRIDES) throw new Error(`الحد الأقصى ${MAX_CURRENCY_OVERRIDES} عملة`);
  for (const [code, arr] of Object.entries(byCurrency)) {
    if (arr.length < QUICK_MIN_AMOUNTS || arr.length > QUICK_MAX_AMOUNTS) {
      throw new Error(`${code}: يلزم بين ${QUICK_MIN_AMOUNTS} و${QUICK_MAX_AMOUNTS} مبالغ`);
    }
  }

  const frequencies = ordered(QUICK_FREQUENCIES, Array.isArray(o.frequencies) ? o.frequencies : [], isFreq);
  if (!frequencies.length) throw new Error("يجب إظهار تكرار واحد على الأقل");
  if (!isFreq(o.defaultFrequency) || !frequencies.includes(o.defaultFrequency)) {
    throw new Error("التكرار الافتراضي يجب أن يكون من التكرارات الظاهرة");
  }

  const genericDestinations = ordered(
    QUICK_GENERIC_DESTINATIONS,
    Array.isArray(o.genericDestinations) ? o.genericDestinations : [],
    isGeneric
  );
  if (!isMode(o.projectsMode)) throw new Error("Invalid projectsMode");
  const projectIds = idsOf(o.projectIds);
  const listEmpty =
    (o.projectsMode === "none" && !genericDestinations.length) ||
    (o.projectsMode === "selected" && !projectIds.length && !genericDestinations.length);
  if (listEmpty) throw new Error("قائمة الوجهات ستكون فارغة — أظهر نية واحدة أو مشروعًا واحدًا على الأقل");

  return parseQuickDonation({ ...o, amounts, byCurrency, frequencies, genericDestinations, projectIds });
}

/* ── What the card reads ─────────────────────────────────────────────────── */

/** Presets for the visitor's currency, and the currency they are priced in. */
export function resolveQuickAmounts(
  config: QuickDonationConfig,
  currencyCode: string | null | undefined
): { amounts: number[]; currency: string } {
  const code = String(currencyCode || "").trim().toUpperCase();
  if (code && code !== "DEFAULT" && code !== "USD" && config.byCurrency[code]?.length) {
    return { amounts: config.byCurrency[code], currency: code };
  }
  return { amounts: config.amounts, currency: "USD" };
}

/** The title for this locale, or null to use the site copy. */
export function quickTitleFor(config: QuickDonationConfig, locale: string): string | null {
  const t = config.titles[locale]?.trim();
  return t || null;
}
