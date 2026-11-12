import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardCampaignBelongsToCategory,
  normalizeDashboardCampaignFilterOptions,
} from "../../lib/dashboard/home-campaign-filter";

test("normalizes actual campaigns/all response with categories array", () => {
  const options = normalizeDashboardCampaignFilterOptions([
    { id: "p1", title: "Project 1", categories: [{ id: "catA" }, { id: "catB" }] },
    { id: "p2", title: "Project 2", categories: [{ id: "catB" }] },
  ]);
  assert.deepEqual(options[0].categoryIds, ["catA", "catB"]);
  assert.equal(dashboardCampaignBelongsToCategory(options[0], "catB"), true);
  assert.equal(dashboardCampaignBelongsToCategory(options[1], "catA"), false);
});

test("supports legacy flat relations and deduplicates category ids", () => {
  const [option] = normalizeDashboardCampaignFilterOptions([
    { id: "p", title: "X", categories: [{ id: "catA" }], category: { id: "catA" },
      categoryIds: ["catA", "catC"], categoryId: "catA" },
  ]);
  assert.deepEqual(option.categoryIds, ["catA", "catC"]);
});

test("empty and malformed responses do not crash or invent categories", () => {
  assert.deepEqual(normalizeDashboardCampaignFilterOptions({ error: "Forbidden" }), []);
  assert.deepEqual(normalizeDashboardCampaignFilterOptions([null, {}, { id: "p", categories: null }])
    .map(x => x.categoryIds), [[]]);
});

test("all category leaves every project visible", () => {
  const [option] = normalizeDashboardCampaignFilterOptions([{ id: "p", title: "A", categories: [] }]);
  assert.equal(dashboardCampaignBelongsToCategory(option, "all"), true);
  assert.equal(dashboardCampaignBelongsToCategory(option, "catA"), false);
});
