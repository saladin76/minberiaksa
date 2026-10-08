import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
test("legacy donor mutation endpoint cannot change amount, status or frequency", () => {
  const source = read("app/api/users/me/subscriptions/[id]/route.ts");
  assert.doesNotMatch(source, /subscriptions\.update|subscriptions\.updateMany|prisma\.subscription\.update/);
  assert.match(source, /INSTITUTION_MANAGED/);
  assert.match(source, /status: 403/);
});
test("donation-linked update API rejects donor status mutations", () => {
  const source = read("app/api/donations/[id]/route.ts");
  assert.match(source, /if \(!isAdmin\)/);
  assert.doesNotMatch(source, /if \(!isAdmin && !isOwner\)/);
});
test("dashboard reductions require donor consent and do not prorate immediately", () => {
  const source = read("app/api/admin/subscriptions/[id]/route.ts");
  assert.match(source, /consentEvidence/);
  assert.match(source, /consentMethod/);
  assert.match(source, /proration_behavior: "none"/);
  assert.match(source, /BILLING_WINDOW_LOCKED/);
  assert.match(source, /SUBSCRIPTION_AMOUNT_REDUCED/);
  assert.match(source, /tx\.subscriptionItem\.update/);
  assert.match(source, /tx\.subscriptionCategoryItem\.update/);
});
test("profile has no active pause or cancel subscription controls", () => {
  const source = read("app/[locale]/profile/page.tsx");
  assert.doesNotMatch(source, /handleCancelSubscription|handleConfirmToggle|handleToggleSubscription/);
  assert.match(source, /التواصل مع المؤسسة/);
});
test("institution-only reduction dialog is visible in monthly dashboard", () => {
  const source = read("app/(dashboard)/dashboard/monthly/page.tsx");
  assert.match(source, /تخفيض مبلغ الاشتراك/);
  assert.match(source, /submitSubscriptionReduction/);
});
