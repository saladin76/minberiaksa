/**
 * Minbar cart — client-side storage contract.
 *
 * Sources: `Minbar/DEVELOPER_HANDOFF.md` § "Cart Localization & Historical
 * Snapshot Contract", `Minbar/DONATION_LOGIC_SPEC.md`, `Minbar/README.md`.
 *
 * The governing rule is:
 *   CART = LIVE LOCALIZED REFERENCE · CONFIRMED ORDER = IMMUTABLE SNAPSHOT
 *
 * So an item stores identifiers only — `projectId` / `titleKey` / `typeKey` /
 * `freqKey` / `currency` code — and the displayed wording is resolved at render
 * time from the active locale. Switching language re-resolves the labels and
 * must never add, remove, reorder or edit an item.
 *
 * `title` is a legacy/fallback field, not a source of truth: v1 carts stored a
 * translated string as the item's identity, and those rows are migrated on read
 * rather than dropped.
 *
 * SECURITY: this is client-controlled data. `DEVELOPER_HANDOFF` is explicit —
 * "localStorage cart data … must never be trusted for final payment
 * calculations". The server re-resolves every id and recomputes amount,
 * currency and availability when an order is created; what is stored here is
 * display state.
 */

/** Donation kind. Drives which proof path (receipt / certificate) applies. */
export type CartTypeKey = "project" | "zakat" | "waqf" | "recurring" | "extra";

/**
 * Frequency. These are the historical frontend values and are deliberately kept
 * — `RECURRING_DONATION_FLOW_MAP.md` requires the backend to normalise them to
 * the official `donationMode`/`frequency` pair rather than reuse `freqKey` in
 * any external API.
 */
export type CartFreqKey = "once" | "daily" | "friday" | "monthly";

export interface MinbarCartItem {
  /** Project slug from the projects source. Absent for non-project intentions. */
  projectId?: string;
  /**
   * i18n key for a generic destination that is not a project — e.g.
   * `whereNeedGreatest`, `zakatToPalestine`, `generalBankTransfer`.
   */
  titleKey?: string;
  typeKey?: CartTypeKey;
  freqKey: CartFreqKey;
  /** Numeric amount in `currency`. Stored as a number, never a formatted string. */
  amount: number;
  /** ISO 4217 code — never a symbol or a translated currency name. */
  currency: string;
  /** Identifier of the upsell suggestion that produced this item, if any. */
  upsellId?: string;
  /**
   * Last-known display title. Fallback only, for legacy rows that could not be
   * resolved to an id — never read in preference to the ids above.
   */
  title?: string;
  /** Set when the "make it monthly" toggle converted this item, so it can be undone. */
  _autoMonthly?: boolean;
}

export const CART_ITEMS_KEY = "mia_cart_items";
export const CART_SCHEMA_KEY = "mia_cart_schema";
/** Item count, kept separately so the header badge reads one small value. */
export const CART_COUNT_KEY = "mia_basket";
/** Fired on every write so the header badge updates without a reload. */
export const CART_UPDATED_EVENT = "mia:basket-updated";

export const CART_SCHEMA_VERSION = 2;

/** Legacy v1 → v2 type mapping, from `السلة.dc.html` → `Component.LEGACY_TYPES`. */
const LEGACY_TYPES: Record<string, CartTypeKey> = {
  مشروع: "project",
  زكاة: "zakat",
  وقف: "waqf",
  دوري: "recurring",
  إضافة: "extra",
};

/** Legacy v1 → v2 frequency mapping, from `Component.LEGACY_FREQS`. */
const LEGACY_FREQS: Record<string, CartFreqKey> = {
  "تبرع لمرة": "once",
  "تبرع يومي": "daily",
  "تبرع كل جمعة": "friday",
  "تبرع شهري": "monthly",
};

const isBrowser = () => typeof window !== "undefined";

/**
 * Parse an amount that may have been stored in the v1 shape (`"$100"`).
 * Returns 0 for anything unparseable rather than NaN, so a corrupt row renders
 * as a zero line the donor can see and fix instead of `NaN` or a silent drop.
 */
function parseAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const digits = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const n = Number.parseFloat(digits);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Bring one stored row up to schema v2.
 *
 * A row whose title cannot be resolved to an id keeps its stored title and is
 * left in the cart. `DEVELOPER_HANDOFF` is explicit that an ambiguous match
 * stays a legacy fallback — "لا تخمين صامت أبدًا" — and that an unresolved item
 * is never silently deleted from someone's cart.
 *
 * @param resolveTitle Maps a display title in any of the 19 locales back to a
 *                     project id. Supplied by the caller so this module has no
 *                     dependency on the projects data.
 */
export function migrateItem(
  raw: Record<string, unknown>,
  resolveTitle?: (title: string) => string | undefined
): MinbarCartItem {
  const item: MinbarCartItem = {
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
    titleKey: typeof raw.titleKey === "string" ? raw.titleKey : undefined,
    typeKey: (raw.typeKey as CartTypeKey) || LEGACY_TYPES[String(raw.type ?? "")] || undefined,
    freqKey: (raw.freqKey as CartFreqKey) || LEGACY_FREQS[String(raw.frequency ?? "")] || "once",
    amount: parseAmount(raw.amount),
    currency: typeof raw.currency === "string" && raw.currency ? raw.currency : "USD",
    upsellId: typeof raw.upsellId === "string" ? raw.upsellId : undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    _autoMonthly: raw._autoMonthly === true || undefined,
  };

  if (!item.projectId && !item.titleKey && item.title && resolveTitle) {
    const resolved = resolveTitle(item.title);
    if (resolved) item.projectId = resolved;
  }

  return item;
}

/** Read the cart, migrating legacy rows. Returns `[]` outside the browser. */
export function readCart(resolveTitle?: (title: string) => string | undefined): MinbarCartItem[] {
  if (!isBrowser()) return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(CART_ITEMS_KEY) || "null");
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      .map((row) => migrateItem(row, resolveTitle));
  } catch {
    // A corrupt value must not take the whole page down; an empty cart is
    // recoverable, a thrown render is not.
    return [];
  }
}

/** Persist the cart, stamp the schema version and notify the header badge. */
export function writeCart(items: MinbarCartItem[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(items));
    window.localStorage.setItem(CART_SCHEMA_KEY, String(CART_SCHEMA_VERSION));
    window.localStorage.setItem(CART_COUNT_KEY, String(items.length));
  } catch {
    // Private-mode / quota failures leave the in-memory cart intact; the event
    // below still fires so the UI stays consistent for this page view.
  }
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT));
}

/** Append an item and persist. Returns the new cart. */
export function addToCart(item: MinbarCartItem): MinbarCartItem[] {
  const next = [...readCart(), item];
  writeCart(next);
  return next;
}

/** Remove the item at `index` and persist. Returns the new cart. */
export function removeFromCart(index: number): MinbarCartItem[] {
  const next = readCart().filter((_, i) => i !== index);
  writeCart(next);
  return next;
}

/** Item count, read from the dedicated counter key. */
export function readCartCount(): number {
  if (!isBrowser()) return 0;
  try {
    const n = Number.parseInt(window.localStorage.getItem(CART_COUNT_KEY) || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Normalise a cart row to the official external contract
 * (`RECURRING_DONATION_FLOW_MAP.md#canonical-contract`). The backend builds
 * `donationMode`/`frequency` from `freqKey`; `freqKey` itself never appears in
 * an outbound payload.
 */
export function toDonationContract(item: MinbarCartItem): {
  donationMode: "one_time" | "recurring";
  frequency: "daily" | "friday" | "monthly" | null;
} {
  if (item.freqKey === "once") return { donationMode: "one_time", frequency: null };
  return { donationMode: "recurring", frequency: item.freqKey };
}

/**
 * Empty the basket.
 *
 * Called once an order exists on the server — after checkout creates the
 * donation, and before the donor is handed to a payment gateway. A donor
 * returning from the bank must not find the same basket sitting there ready to
 * be paid a second time.
 */
export function clearCart(): void {
  writeCart([]);
}
