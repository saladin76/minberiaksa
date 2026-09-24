/**
 * The basket's cross-sell block ("وسِّع أثر عطاءك"): a short list of
 * campaigns with quick-pick amounts, offered under the rows already in the
 * basket. Managed at `/dashboard/cart-settings`, stored on
 * `GlobalSettings.cartUpsell` as `{ items: [{ campaignId, amounts }] }`.
 *
 * Campaigns are keyed by id (slugs differ per locale); the cart page maps
 * each id to the published project list it already has, so a campaign that
 * has since been unpublished simply does not show.
 */

export interface CartUpsellItem {
  campaignId: string;
  /** Quick-pick amounts in the donor's active currency. */
  amounts: number[];
}

export interface CartUpsellConfig {
  items: CartUpsellItem[];
}

export const DEFAULT_CART_UPSELL_AMOUNTS = [50, 75, 100];
export const CART_UPSELL_MAX_ITEMS = 8;
export const CART_UPSELL_MAX_AMOUNTS = 6;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function amountsOf(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === "number" ? x : Number(x);
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Coerce stored / API JSON into a config; anything malformed is dropped. */
export function parseCartUpsell(raw: unknown): CartUpsellConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { items: [] };
  const list = (raw as { items?: unknown }).items;
  if (!Array.isArray(list)) return { items: [] };
  const items: CartUpsellItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const campaignId = typeof o.campaignId === "string" ? o.campaignId.trim() : "";
    if (!OBJECT_ID.test(campaignId) || items.some((i) => i.campaignId === campaignId)) continue;
    const amounts = amountsOf(o.amounts);
    items.push({ campaignId, amounts: amounts.length ? amounts : [...DEFAULT_CART_UPSELL_AMOUNTS] });
    if (items.length >= CART_UPSELL_MAX_ITEMS) break;
  }
  return { items };
}

/** Validate an admin save; throws with a message the dashboard can show. */
export function validateCartUpsellBody(body: unknown): CartUpsellConfig {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid cartUpsell");
  const list = (body as { items?: unknown }).items;
  if (!Array.isArray(list)) throw new Error("cartUpsell.items must be a list");
  if (list.length > CART_UPSELL_MAX_ITEMS) throw new Error(`At most ${CART_UPSELL_MAX_ITEMS} suggested campaigns`);
  const seen = new Set<string>();
  const items: CartUpsellItem[] = [];
  for (const entry of list) {
    const o = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const campaignId = typeof o.campaignId === "string" ? o.campaignId.trim() : "";
    if (!OBJECT_ID.test(campaignId)) throw new Error("Every suggestion needs a campaign");
    if (seen.has(campaignId)) throw new Error("A campaign is listed twice");
    seen.add(campaignId);
    const amounts = amountsOf(o.amounts);
    if (!amounts.length) throw new Error("Every suggestion needs at least one amount");
    if (amounts.length > CART_UPSELL_MAX_AMOUNTS) throw new Error(`At most ${CART_UPSELL_MAX_AMOUNTS} amounts per campaign`);
    items.push({ campaignId, amounts });
  }
  return { items };
}
