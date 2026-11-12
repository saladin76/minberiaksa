import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ga4SafeEventPayload } from "../../lib/tracking/ga4-safe-event-payload";
import type { CanonicalEvent } from "../../lib/tracking/canonical";

const root = resolve(process.cwd());

test("GA4 ecommerce payload is limited to safe commerce attributes", () => {
  const event: CanonicalEvent = {
    event: "add_payment_info", event_id: "synthetic-event", event_time: 123,
    user: { email: "test@example.invalid", phone: "+900000000000", first_name: "PRIVATE", last_name: "PRIVATE", external_id: "PRIVATE" },
    payment: { method: "CARD", gateway: "albaraka", transaction_id: "synthetic_order_42" },
    donation: { amount: 50, currency: "USD", donation_type: "MONTHLY" },
    page: { url: "https://minberiaksa.org/ar/checkout?t=PRIVATE" },
    items: [{ item_id: "project_42", item_name: "PRIVATE", price: 50, quantity: 1 }],
    custom: { email: "test@example.invalid", phone: "+900000000000", cardNumber: "4111111111111111", cvv: "123", arbitrary: "PRIVATE", engagement_time_msec: 2000 },
  };
  const safe = ga4SafeEventPayload(event);
  assert.deepEqual(safe, {
    value: 50, currency: "USD", transaction_id: "synthetic_order_42",
    items: [{ item_id: "project_42", price: 50, quantity: 1 }],
    payment_type: "card", payment_gateway: "albaraka",
    donation_type: "monthly", engagement_time_msec: 2000,
  });
  const serialized = JSON.stringify(safe);
  assert.doesNotMatch(serialized, /PRIVATE|example.invalid|411111|cvv|phone|email|first_name|last_name/);
});

test("GA4 ignores malformed amounts, unknown card values, arbitrary custom keys", () => {
  const event: CanonicalEvent = {
    event: "payment_submit", event_id: "synthetic", event_time: 123,
    donation: { amount: Number.POSITIVE_INFINITY, currency: "USD--bad" },
    payment: { method: "PAN=4111111111111111", transaction_id: "https://payment.example/t=token" },
    custom: { authToken: "secret", percent_scrolled: -10, milestone: "https://bad.example" },
  };
  assert.deepEqual(ga4SafeEventPayload(event), {});
});

test("new Minbar cart emits minimal AddToCart only for actual additions", () => {
  const s = readFileSync(resolve(root, "lib/minbar/cart.ts"), "utf8");
  assert.match(s, /CART_ITEM_ADDED_EVENT/);
  const add = s.slice(s.indexOf("export function addToCart("), s.indexOf("export function removeFromCart("));
  assert.match(add, /new CustomEvent\(CART_ITEM_ADDED_EVENT/);
  assert.doesNotMatch(add, /recipientPhone|recipientEmail|message:|donorName|onBehalf/);
  const pix = readFileSync(resolve(root, "components/TrackingPixels.tsx"), "utf8");
  assert.match(pix, /addEventListener\(CART_ITEM_ADDED_EVENT/);
  assert.match(pix, /ga4SafeEventPayload\(event\)/);
  assert.doesNotMatch(pix, /ga4\.email|ga4\.phone|ga4\.first_name|ga4\.last_name|Object\.assign\(ga4, event\.custom\)/);
  const concierge = readFileSync(resolve(root, "components/minbar/concierge/useConcierge.ts"), "utf8");
  assert.doesNotMatch(concierge, /tracking\?\.trackAddToCart/);
});

test("real CheckoutPage emits non-paid funnel stages without PAN/CVC", () => {
  const s = readFileSync(resolve(root, "components/minbar/checkout/CheckoutPage.tsx"), "utf8");
  for (const name of ["trackInitiateCheckout", "trackAddPaymentInfo", "trackPaymentSubmit"]) {
    assert.match(s, new RegExp("tracking\\?\\." + name + "\\("));
  }
  const events = s.slice(s.indexOf("    submitLock.current = true;"), s.indexOf("    const methodForServer: CheckoutMethod"));
  assert.doesNotMatch(events, /(?:cardNumber|cardCvc|cardExpiry|email|phone|cardName)\s*:/);
  const canonical = readFileSync(resolve(root, "lib/tracking/canonical.ts"), "utf8");
  assert.match(canonical, /payment_submit:\s*"payment_submit"/);
});

test("anonymous funnel reporting is opt-in, bounded and independently permission-gated", () => {
  const ledger = readFileSync(resolve(root, "lib/tracking/funnel-observations.ts"), "utf8");
  assert.match(ledger, /FUNNEL_OBSERVATION_ENABLED/);
  assert.match(ledger, /MAX_PER_MINUTE = 40/);
  assert.match(ledger, /createIndexes: COLLECTION/);
  assert.match(ledger, /expireAfterSeconds: TTL_SECONDS/);
  assert.match(ledger, /source: "anonymous_client"/);
  assert.match(ledger, /channel: "browser_reported"/);
  const audit = readFileSync(resolve(root, "app/api/admin/tracking/funnel-audit/route.ts"), "utf8");
  assert.match(audit, /requireAdminOrDashboardPermission\(session, "platformConnections"\)/);
  assert.match(audit, /readFunnelSummary/);
  assert.doesNotMatch(audit, /select: \{.*email|phone|cardNumber|accessToken/);
});

test("public event endpoint rejects unsupported events and strips query tokens", () => {
  const route = readFileSync(resolve(root, "app/api/track/route.ts"), "utf8");
  assert.match(route, /ALLOWED_FUNNEL_EVENTS\.has\(event\.event\)/);
  assert.match(route, /raw\.length > 24_000/);
  assert.match(route, /safePageUrl\(event\.page\?\.url, req\.url\)/);
  assert.match(route, /recordFunnelObservation\(event, clientIp\)/);
  assert.match(route, /providerFailure \? 502 : 200/);
});
