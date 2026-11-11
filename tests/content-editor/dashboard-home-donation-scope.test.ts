import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardDonationScopeParams,
  dashboardStatsScopeParams,
  type HomeDonationScope,
} from "../../lib/dashboard/home-donation-scope";

const base: HomeDonationScope = {
  categoryId: "category-1",
  campaignId: "project-2",
  userId: "donor-3",
  start: "2026-11-01",
  end: "2026-11-11",
  locale: "tr",
  country: "TR",
  provider: "ALBARAKA",
  status: "RESOLVED",
  donationType: "MONTHLY",
};

test("chart and table share one filtered donation scope", () => {
  const params = dashboardDonationScopeParams(base);
  for (const [key, expected] of Object.entries({
    categoryId:"category-1",campaignId:"project-2",userId:"donor-3",
    start:"2026-11-01",end:"2026-11-11",
    locale:"tr",country:"TR",provider:"ALBARAKA",
    status:"RESOLVED",donationType:"MONTHLY",
  })) assert.equal(params.get(key), expected);
});

test("all option values are omitted but explicit status is kept", () => {
  const params = dashboardDonationScopeParams({
    ...base, categoryId:"all",campaignId:"all",userId:"all",
    start:null,end:null,locale:"all",country:"all",provider:"all",
    status:"RESOLVED",donationType:"all",
  });
  assert.deepEqual([...params.keys()], ["status"]);
});

test("stats scope intentionally excludes unsupported donor/status/type filters", () => {
  const params=dashboardStatsScopeParams(base, "custom");
  assert.equal(params.get("period"),"custom");
  assert.equal(params.get("userId"),null);
  assert.equal(params.get("status"),null);
  assert.equal(params.get("donationType"),null);
  assert.equal(params.get("provider"),"ALBARAKA");
  assert.equal(params.get("start"),"2026-11-01");
});

test("unassigned country, locale filters stay explicit", () => {
  const params=dashboardDonationScopeParams({...base,country:"__unset",locale:"__unset"});
  assert.equal(params.get("country"),"__unset");
  assert.equal(params.get("locale"),"__unset");
});
