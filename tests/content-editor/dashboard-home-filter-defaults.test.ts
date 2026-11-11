import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  HOME_FILTER_DEFAULTS,
  homeFiltersAreModified,
} from "../../lib/dashboard/home-filter-defaults";

test("default home state has no active reset action", () => {
  assert.equal(homeFiltersAreModified({ ...HOME_FILTER_DEFAULTS }), false);
});

test("reset action is visible for every independently changed filter", () => {
  const changed = {
    categoryId: "category-1", campaignId: "project-1", userId: "donor-1",
    period: "week", dateFrom: "2026-11-01", dateTo: "2026-11-11",
    locale: "tr", country: "TR", provider: "ALBARAKA",
    status: "FAILED", donationType: "MONTHLY", donationSearch: "reference",
  };
  for (const [field, value] of Object.entries(changed)) {
    assert.equal(homeFiltersAreModified({ ...HOME_FILTER_DEFAULTS, [field]: value }), true, field);
  }
});

test("clearing all resets to shared defined defaults", () => {
  const reset = { ...HOME_FILTER_DEFAULTS };
  assert.equal(reset.status, "RESOLVED");
  assert.equal(reset.period, "month");
  assert.equal(reset.country, "all");
  assert.equal(reset.donationSearch, "");
});

test("clearing a donor deep-link restores global metrics and donor selector", () => {
  const page = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
  assert.equal(page.includes('!searchParams.get("userId")'), false);
  assert.match(page, /selectedUserId === "all" && <>/);
  assert.match(page, /selectedUserId === "all" && \(/);
  assert.match(page, /const linkedDonorId = searchParams.get\("userId"\)/);
  assert.match(page, /\}, \[linkedDonorId\]\)/);
});
