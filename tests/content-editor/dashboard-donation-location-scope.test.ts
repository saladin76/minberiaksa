import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dashboardCountryWhere, dashboardLocaleWhere } from "../../lib/dashboard/donation-location-scope";

test("unfiltered locale and country remain absent", () => {
  for (const v of [null, undefined, "", "all", " all "]) {
    assert.equal(dashboardLocaleWhere(v), null);
    assert.equal(dashboardCountryWhere(v), null);
  }
});

test("unassigned locale covers explicit null, empty and legacy absent Mongo fields", () => {
  assert.deepEqual(dashboardLocaleWhere("__unset"), {
    OR: [{ locale: null }, { locale: "" }, { locale: { isSet: false } }],
  });
});

test("unassigned country covers null, empty and legacy absent Mongo fields", () => {
  assert.deepEqual(dashboardCountryWhere("__unset"), {
    OR: [
      { donorCountryCode: null },
      { donorCountryCode: "" },
      { donorCountryCode: { isSet: false } },
    ],
  });
});

test("normal locale/country filters retain exact values and uppercased country", () => {
  assert.deepEqual(dashboardLocaleWhere("tr"), { locale: "tr" });
  assert.deepEqual(dashboardCountryWhere("tr"), { donorCountryCode: "TR" });
});

test("chart, ledger and KPI endpoints all use the same location scope functions", () => {
  const files = [
    "app/api/admin/donations/chart/route.ts",
    "app/api/admin/stats/route.ts",
    "app/api/donations/route.ts",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /dashboardLocaleWhere/);
    assert.match(source, /dashboardCountryWhere/);
  }
});
