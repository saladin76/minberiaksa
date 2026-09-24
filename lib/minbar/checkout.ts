import type { MinbarCartItem } from "./cart";
import type { MinbarProject } from "./projects";
import { orderTypeForItems, type OrderType } from "@/lib/donations/recurring-schedule";

/**
 * The Minbar checkout's payment driver.
 *
 * `Minbar/بيانات الدفع.dc.html` has no backend, so its form submits nothing.
 * This is the sequence the site actually runs, drawn from the existing
 * `components/CartPaymentDialog.tsx`, which is the reference implementation for
 * every gateway rail:
 *
 *   1. `POST /api/cart/payment` — the server re-resolves every project,
 *      recomputes the amount, and creates a PENDING donation.
 *   2. the gateway is chosen from the donation's currency and the admin
 *      switches (`resolveGateway`), never by the browser.
 *   3. card rails post a signed HTML form to the bank's 3-D Secure page
 *      (`/api/payfor/3dpay/initiate` or `/api/albaraka/3d/initiate`); Stripe
 *      confirms a payment intent instead.
 *   4. the bank redirects to its callback, which lands the donor on
 *      `/{locale}/success/{donationId}`.
 *
 * The rule the handoff states and this honours: the browser's cart is display
 * state and is never the basis for a charge. What is posted is a list of
 * campaign **ids** and amounts — and, for a row that gives to a category as a
 * whole, category ids and amounts; the server prices them.
 *
 * One deliberate simplification against the reference: the bank form is always
 * submitted into the current tab (`_self`) rather than a popup. The reference
 * opens a popup on desktop and skips it on mobile and in in-app browsers,
 * because there `window.open` returns a truthy but invisible window and the
 * donor sees nothing happen. A full-page redirect is the path that works
 * everywhere, and 3-D Secure is a page that should own the screen.
 */

/** How the server names the payment rails. */
export type CheckoutMethod = "CARD" | "PAYPAL" | "BANK_TRANSFER";

export interface CheckoutDonor {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface CreateDonationInput {
  items: readonly MinbarCartItem[];
  /** Every published project, used to resolve a cart slug to a campaign id. */
  projects: readonly MinbarProject[];
  currency: string;
  locale: string;
  method: CheckoutMethod;
  /** Present when the donor is not signed in. */
  guest: CheckoutDonor | null;
  /** Referral code from the visit, if the campaign-link layer captured one. */
  referralCode?: string | null;
  /**
   * Bank transfer only: the published account the donor was shown and the
   * currency of the IBAN they picked, so the finance review knows where to
   * look for the money.
   */
  bank?: { slug: string; currency: string } | null;
}

export interface CreatedDonation {
  id: string;
  /**
   * The guest's key to the success page and documents, carried as `?t=`.
   * A signed-in donor is let in by their session and it is harmless to them.
   */
  accessToken: string | null;
  /** Set when the cart contained a recurring item and a plan was created. */
  subscriptionId: string | null;
  /**
   * Bank transfer only: the secret that lets a guest reach the receipt upload
   * page. Appended to the redirect as `?t=`; a signed-in owner is let in by
   * their session regardless.
   */
  bankTransferToken: string | null;
}

/** Everything a bank's 3-D Secure page needs, as the initiate route returns it. */
export interface GatewayForm {
  actionUrl: string;
  fields: Record<string, string>;
}

/** The three kinds of line the order API takes. */
export interface OrderLines {
  items: Array<{ campaignId: string; amount: number }>;
  categoryItems: Array<{ categoryId: string; amount: number }>;
  /**
   * Waqf rows carry no amount: the server prices them from the fixed unit
   * price, so a basket edited by hand cannot buy a metre for a dollar.
   */
  waqfItems: Array<{ unit: "share" | "meter"; count: number; donorName: string; onBehalf: string }>;
}

/**
 * Cart items as the order API wants them.
 *
 * A cart row carries a project **slug**; the API keys on the campaign id. The
 * mapping uses the project list the checkout page was already given, so no
 * extra request is needed and an item whose project has since been unpublished
 * simply drops out rather than failing the whole order.
 *
 * A row that gives to a category already carries the category's id, so it
 * passes through as a category line; the API checks that the category exists.
 */
export function toOrderItems(
  items: readonly MinbarCartItem[],
  projects: readonly MinbarProject[]
): OrderLines {
  const bySlug = new Map(projects.map((project) => [project.slug, project.id]));
  const lines: OrderLines = { items: [], categoryItems: [], waqfItems: [] };

  for (const item of items) {
    const campaignId = item.projectId ? bySlug.get(item.projectId) : undefined;
    if (campaignId) lines.items.push({ campaignId, amount: item.amount });
    else if (item.categoryId) lines.categoryItems.push({ categoryId: item.categoryId, amount: item.amount });
    else if (item.waqf) {
      lines.waqfItems.push({
        unit: item.waqf.unit,
        count: item.waqf.count,
        donorName: item.waqf.donorName.trim(),
        onBehalf: item.waqf.onBehalf.trim(),
      });
    }
  }

  return lines;
}

/**
 * The one type the order carries: `ONE_TIME`, or the cadence of the plan.
 *
 * The order API takes one type for the whole order, so a cart holding any
 * recurring row is a plan at that row's cadence; the cart page does not let
 * cadences mix. This used to return `MONTHLY` for every recurring row, so a
 * donor who chose "daily" or "every Friday" was billed monthly — the contract
 * mismatch in `DEPLOYED_VS_DESIGN_AUDIT.md` § P0.2. The mapping now lives in
 * `lib/donations/recurring-schedule.ts` and is pinned by its tests.
 */
export function orderType(items: readonly MinbarCartItem[]): OrderType {
  return orderTypeForItems(items);
}

/**
 * The browser's IANA zone, for the plan's Friday / month-day resolution. The
 * server validates it and falls back to UTC; it is never used for the charge
 * itself, only to say which day "Friday" is for this donor.
 */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Create the PENDING donation.
 *
 * Throws with the server's message when the order is rejected, so the form can
 * say what went wrong rather than failing silently.
 */
export async function createDonation(input: CreateDonationInput): Promise<CreatedDonation> {
  const { items, categoryItems, waqfItems } = toOrderItems(input.items, input.projects);
  if (items.length === 0 && categoryItems.length === 0 && waqfItems.length === 0) throw new Error("cart-empty");

  const response = await fetch("/api/cart/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      ...(categoryItems.length ? { categoryItems } : {}),
      ...(waqfItems.length ? { waqfItems } : {}),
      currency: input.currency,
      type: orderType(input.items),
      timezone: browserTimezone(),
      paymentMethod: input.method,
      locale: input.locale,
      ...(input.referralCode ? { referralCode: input.referralCode } : {}),
      ...(input.method === "BANK_TRANSFER" && input.bank
        ? { bankSlug: input.bank.slug, bankCurrency: input.bank.currency }
        : {}),
      ...(input.guest
        ? {
            guest: {
              firstName: input.guest.firstName,
              lastName: input.guest.lastName,
              email: input.guest.email,
              phone: input.guest.phone,
            },
          }
        : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        donation?: { id: string; accessToken?: string | null };
        subscription?: { id: string };
        bankTransfer?: { accessToken: string };
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.donation?.id) {
    throw new Error(payload?.error || "order-failed");
  }

  return {
    id: payload.donation.id,
    accessToken: payload.donation.accessToken ?? null,
    subscriptionId: payload.subscription?.id ?? null,
    bankTransferToken: payload.bankTransfer?.accessToken ?? null,
  };
}

/**
 * Ask the bank rail for a signed 3-D Secure form.
 *
 * Albaraka signs the card fields into the request MAC, so its card details go
 * to our server to be signed. PayFor leaves them out of its hash, so the
 * browser appends them below and the card number never reaches this origin —
 * which is the constraint the handoff states for this page.
 */
export async function initiateBankPayment(
  donationId: string,
  locale: string,
  gateway: "PAYFOR" | "ALBARAKA",
  card?: { number: string; expiry: string; cvv: string; holder: string }
): Promise<GatewayForm> {
  const endpoint = gateway === "ALBARAKA" ? "/api/albaraka/3d/initiate" : "/api/payfor/3dpay/initiate";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      donationId,
      locale,
      ...(gateway === "ALBARAKA" && card ? { card } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as (GatewayForm & { error?: string }) | null;
  if (!response.ok || !payload?.actionUrl) throw new Error(payload?.error || "gateway-failed");

  return { actionUrl: payload.actionUrl, fields: payload.fields ?? {} };
}

/**
 * Post the bank's form and hand the screen over to its 3-D Secure page.
 *
 * `browserFields` are the card values the gateway does not sign — PayFor only.
 * Appending anything for Albaraka would break its MAC, so the caller passes
 * nothing there.
 */
export function submitGatewayForm(form: GatewayForm, browserFields: Record<string, string> = {}): void {
  const element = document.createElement("form");
  element.method = "POST";
  element.action = form.actionUrl;
  element.target = "_self";

  for (const [name, value] of Object.entries({ ...form.fields, ...browserFields })) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value ?? "");
    element.appendChild(input);
  }

  document.body.appendChild(element);
  element.submit();
  document.body.removeChild(element);
}

/**
 * Mark a donation failed when the rail could not be reached at all.
 *
 * Without this the row sits PENDING forever and shows up in reconciliation as
 * an unexplained gap. Best-effort: a failure to record a failure must not
 * replace the message the donor is about to be shown.
 */
export async function markDonationFailed(donationId: string, reason: string): Promise<void> {
  try {
    await fetch(`/api/donations/${donationId}/fail`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  } catch {
    /* Nothing more to do here. */
  }
}

/**
 * Ask the site's own charge route for the Stripe PaymentIntent secret.
 *
 * The route creates a PaymentIntent for a one-time gift and a real monthly
 * Stripe Subscription for a monthly plan (its first invoice's intent is what
 * comes back); the browser then confirms with `stripe.js`, so card data goes
 * from the donor to Stripe and never through this origin. Daily and Friday
 * plans never reach Stripe — they run on Albaraka.
 */
export async function chargeWithStripe(donationId: string, locale: string): Promise<{ clientSecret: string }> {
  const response = await fetch("/api/stripe/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ donationId, locale }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { clientSecret?: string; error?: string }
    | null;

  if (!response.ok || !payload?.clientSecret) throw new Error(payload?.error || "stripe-failed");
  return { clientSecret: payload.clientSecret };
}
