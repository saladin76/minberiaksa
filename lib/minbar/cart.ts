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

/**
 * What a waqf row carries besides its amount: the unit, how many, and the
 * two names the certificate prints. The certificate NUMBER is deliberately not
 * here — `DONATION_LOGIC_SPEC §2` has the server mint it after payment, and a
 * number kept in the basket would be one a donor could quote before paying.
 */
export interface CartWaqfDetails {
  unit: "share" | "meter";
  count: number;
  /** The endower's name, as it should appear on the certificate. */
  donorName: string;
  /** Whom the waqf is endowed on behalf of. */
  onBehalf: string;
}

/**
 * A gift: the row is given in someone else's name. The thank-you certificate
 * is issued to `recipientName`, and once the donation is confirmed the
 * recipient is told on the chosen channels — a WhatsApp number, an email, or
 * both — with the donor's note. Collected on the project page
 * (`DonationPanel`), shown on the basket row, sent with the order as part of
 * the line, and stored on `DonationItem`.
 */
export interface CartGiftDetails {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  message: string;
  channels: Array<"whatsapp" | "email">;
  /** Whether the message to the recipient mentions the amount. */
  showAmount: boolean;
}

export interface MinbarCartItem {
  /** Project slug from the projects source. Absent for non-project intentions. */
  projectId?: string;
  /**
   * Category **id** (never a slug — category slugs differ per locale) when the
   * row gives to a category as a whole rather than to one of its campaigns.
   * The order carries it as a category item.
   */
  categoryId?: string;
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
  /** Present on a waqf row (`typeKey: "waqf"`): the certificate's details. */
  waqf?: CartWaqfDetails;
  /** Present when the row is given in someone else's name. */
  gift?: CartGiftDetails;
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

/** The waqf details of a stored row, or nothing if they are not all there. */
function parseWaqf(value: unknown): CartWaqfDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const unit = raw.unit === "meter" ? "meter" : raw.unit === "share" ? "share" : null;
  const count = typeof raw.count === "number" && Number.isInteger(raw.count) && raw.count > 0 ? raw.count : null;
  if (!unit || !count) return undefined;
  return {
    unit,
    count,
    donorName: typeof raw.donorName === "string" ? raw.donorName : "",
    onBehalf: typeof raw.onBehalf === "string" ? raw.onBehalf : "",
  };
}

/** The gift details of a stored row, or nothing without a recipient name. */
function parseGift(value: unknown): CartGiftDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const recipientName = typeof raw.recipientName === "string" ? raw.recipientName.trim() : "";
  if (!recipientName) return undefined;
  const channels = Array.isArray(raw.channels)
    ? (raw.channels.filter((c): c is "whatsapp" | "email" => c === "whatsapp" || c === "email"))
    : [];
  return {
    recipientName,
    recipientPhone: typeof raw.recipientPhone === "string" ? raw.recipientPhone.trim() : "",
    recipientEmail: typeof raw.recipientEmail === "string" ? raw.recipientEmail.trim() : "",
    message: typeof raw.message === "string" ? raw.message : "",
    channels,
    showAmount: raw.showAmount !== false,
  };
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
    categoryId: typeof raw.categoryId === "string" ? raw.categoryId : undefined,
    titleKey: typeof raw.titleKey === "string" ? raw.titleKey : undefined,
    typeKey: (raw.typeKey as CartTypeKey) || LEGACY_TYPES[String(raw.type ?? "")] || undefined,
    freqKey: (raw.freqKey as CartFreqKey) || LEGACY_FREQS[String(raw.frequency ?? "")] || "once",
    amount: parseAmount(raw.amount),
    currency: typeof raw.currency === "string" && raw.currency ? raw.currency : "USD",
    upsellId: typeof raw.upsellId === "string" ? raw.upsellId : undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    _autoMonthly: raw._autoMonthly === true || undefined,
    waqf: parseWaqf(raw.waqf),
    gift: parseGift(raw.gift),
  };

  if (!item.projectId && !item.categoryId && !item.titleKey && item.title && resolveTitle) {
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
  writeTeamSupport(0);
  writeTeamSupportRecurring(null);
}

// ── Team support ─────────────────────────────────────────────────────────────
//
// "Support the team" belongs to the whole order, not to a campaign: it is
// asked once, in the basket before checkout, and sent with the order. When
// the basket holds a recurring row the amount is charged with every
// instalment (it is part of the plan); when every row is one-time it is
// charged once. Stored beside the cart so a reload keeps the choice, cleared
// with it.

export const CART_TEAM_SUPPORT_KEY = "mia_cart_team_support";

/** The team-support amount chosen in the basket (in the active currency), or 0. */
export function readTeamSupport(): number {
  if (!isBrowser()) return 0;
  try {
    const n = Number(window.localStorage.getItem(CART_TEAM_SUPPORT_KEY) ?? "0");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeTeamSupport(amount: number): void {
  if (!isBrowser()) return;
  try {
    if (amount > 0) window.localStorage.setItem(CART_TEAM_SUPPORT_KEY, String(amount));
    else window.localStorage.removeItem(CART_TEAM_SUPPORT_KEY);
  } catch {
    /* Private mode; the in-memory choice still applies to this page view. */
  }
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT));
}

/** Whether any row is a plan — which makes the team support recurring too. */
export function cartHasRecurring(items: readonly MinbarCartItem[]): boolean {
  return items.some((item) => item.freqKey !== "once");
}

/**
 * Whether the team support rides along with every instalment of a recurring
 * basket, or is charged once. `null` means the donor has not chosen — the
 * default is "with the plan" when the basket has a recurring row. Only
 * meaningful for a recurring basket; a one-time basket charges once.
 */
export const CART_TEAM_SUPPORT_RECURRING_KEY = "mia_cart_team_support_recurring";

export function readTeamSupportRecurring(): boolean | null {
  if (!isBrowser()) return null;
  try {
    const v = window.localStorage.getItem(CART_TEAM_SUPPORT_RECURRING_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function writeTeamSupportRecurring(value: boolean | null): void {
  if (!isBrowser()) return;
  try {
    if (value === null) window.localStorage.removeItem(CART_TEAM_SUPPORT_RECURRING_KEY);
    else window.localStorage.setItem(CART_TEAM_SUPPORT_RECURRING_KEY, value ? "1" : "0");
  } catch {
    /* Private mode; the in-memory choice still applies to this page view. */
  }
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT));
}

/** The effective choice: the donor's, else "with the plan" for a recurring basket. */
export function teamSupportIsRecurring(items: readonly MinbarCartItem[], choice: boolean | null): boolean {
  if (!cartHasRecurring(items)) return false;
  return choice ?? true;
}
