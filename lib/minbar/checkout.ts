import type { MinbarCartItem } from "./cart";
import type { MinbarProject } from "./projects";

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
 * campaign **ids** and amounts; the server prices them.
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
}

export interface CreatedDonation {
  id: string;
  /** Set when the cart contained a recurring item and a plan was created. */
  subscriptionId: string | null;
}

/** Everything a bank's 3-D Secure page needs, as the initiate route returns it. */
export interface GatewayForm {
  actionUrl: string;
  fields: Record<string, string>;
}

/**
 * Cart items as the order API wants them.
 *
 * A cart row carries a project **slug**; the API keys on the campaign id. The
 * mapping uses the project list the checkout page was already given, so no
 * extra request is needed and an item whose project has since been unpublished
 * simply drops out rather than failing the whole order.
 */
export function toOrderItems(
  items: readonly MinbarCartItem[],
  projects: readonly MinbarProject[]
): Array<{ campaignId: string; amount: number }> {
  const bySlug = new Map(projects.map((project) => [project.slug, project.id]));

  return items
    .map((item) => {
      const campaignId = item.projectId ? bySlug.get(item.projectId) : undefined;
      return campaignId ? { campaignId, amount: item.amount } : null;
    })
    .filter((row): row is { campaignId: string; amount: number } => row !== null);
}

/**
 * Whether the cart is a recurring plan.
 *
 * The order API takes one type for the whole order, so a cart holding any
 * recurring row is a subscription. The cart page does not let the two be mixed.
 */
export function orderType(items: readonly MinbarCartItem[]): "ONE_TIME" | "MONTHLY" {
  return items.some((item) => item.freqKey !== "once") ? "MONTHLY" : "ONE_TIME";
}

/**
 * Create the PENDING donation.
 *
 * Throws with the server's message when the order is rejected, so the form can
 * say what went wrong rather than failing silently.
 */
export async function createDonation(input: CreateDonationInput): Promise<CreatedDonation> {
  const items = toOrderItems(input.items, input.projects);
  if (items.length === 0) throw new Error("cart-empty");

  const response = await fetch("/api/cart/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      currency: input.currency,
      type: orderType(input.items),
      paymentMethod: input.method,
      locale: input.locale,
      ...(input.referralCode ? { referralCode: input.referralCode } : {}),
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
    | { donation?: { id: string }; subscription?: { id: string }; error?: string }
    | null;

  if (!response.ok || !payload?.donation?.id) {
    throw new Error(payload?.error || "order-failed");
  }

  return { id: payload.donation.id, subscriptionId: payload.subscription?.id ?? null };
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

/** Confirm a Stripe donation through the site's own charge route. */
export async function chargeWithStripe(donationId: string, locale: string): Promise<{ clientSecret?: string }> {
  const response = await fetch("/api/stripe/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ donationId, locale }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { clientSecret?: string; error?: string }
    | null;

  if (!response.ok) throw new Error(payload?.error || "stripe-failed");
  return { clientSecret: payload?.clientSecret };
}
