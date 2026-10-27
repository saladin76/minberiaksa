import { test } from "node:test";
import assert from "node:assert/strict";
import { donationProviderWhere, mergeDonationProviderFilter } from "../../lib/dashboard/donation-provider-filter";
import { userCanOpenDashboardPath, userHasDashboardPermission } from "../../lib/dashboard/permissions";
import { recentMarketingDeliveryWhere } from "../../lib/communication/recent-marketing-filter";

test("gateway filter composes with existing OR/AND without replacing dates or status", () => {
  const base = { AND: [{ status: "PAID", paidAt: { not: null } }, { OR: [{ locale: "ar" }, { locale: "tr" }] }] };
  const snapshot = structuredClone(base);
  assert.deepEqual(mergeDonationProviderFilter(base, "paypal"), { AND: [base, { provider: "PAYPAL" }] });
  assert.deepEqual(base, snapshot);
  assert.equal(mergeDonationProviderFilter(base, "all"), base);
  assert.equal(donationProviderWhere(null), null);
  assert.deepEqual(donationProviderWhere("__unset"), { OR: [{ provider: null }, { provider: "" }, { provider: { isSet: false } }] });
});

test("recent marketing exclusion retains accepted contacts even if a later delivery fails", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  const filter = recentMarketingDeliveryWhere(7, now);
  assert.equal(filter.purpose, "MARKETING");
  assert.equal("channel" in filter, false);
  assert.deepEqual(filter.sentAt, { gte: new Date("2026-10-19T10:00:00Z"), lte: now });
  assert.deepEqual(filter.OR, [{ status: { in: ["SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED"] } }, { providerMessageId: { not: null } }]);
  for (const days of [0, -1, 1.5, NaN, 3651]) assert.throws(() => recentMarketingDeliveryWhere(days));
});

test("shared content workspace allows either tool permission without granting the other tool", () => {
  const blog = { role: "STAFF", dashboardPermissions: ["blog"] };
  const seo = { role: "STAFF", dashboardPermissions: ["siteContent"] };
  for (const path of ["/dashboard/seo-pages", "/dashboard/editorial-planner"]) {
    assert.equal(userCanOpenDashboardPath(blog, path), true); assert.equal(userCanOpenDashboardPath(seo, path), true);
    assert.equal(userCanOpenDashboardPath({ role: "STAFF", dashboardPermissions: ["users"] }, path), false);
    assert.equal(userCanOpenDashboardPath(undefined, path), false);
  }
  assert.equal(userHasDashboardPermission(blog, "siteContent"), false);
  assert.equal(userHasDashboardPermission(seo, "blog"), false);
});
