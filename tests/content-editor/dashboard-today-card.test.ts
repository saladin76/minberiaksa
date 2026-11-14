import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
const cards = fs.readFileSync("components/dashboard/HomeDonationSummary.tsx", "utf8");
const todayFetch = page.slice(page.indexOf("const fetchTodayData"), page.indexOf("useEffect(() => {\n    fetchTodayData();"));

test("today card uses the active filters with the period fixed to today and settled revenue only", () => {
  assert.ok(todayFetch.length > 0, "fetchTodayData missing");
  assert.match(todayFetch, /getDonationsDateRange\("day", "", ""\)/);
  assert.match(todayFetch, /params\.set\("period", "day"\)/);
  assert.match(todayFetch, /status: "PAID"/);
  for (const filter of ["selectedCategory", "selectedCampaign", "selectedUserId", "donationLocaleFilter", "donationCountryFilter", "donationProviderFilter", "donationsTypeFilter"]) {
    assert.match(todayFetch, new RegExp(filter), `today card ignores ${filter}`);
  }
  const deps = todayFetch.slice(todayFetch.lastIndexOf("}, ["));
  assert.doesNotMatch(deps, /chartPeriod|dateFrom|dateTo/, "the selected period must not change today's card");
});

test("today card is first, refreshes with the dashboard and never reads the retired global summary", () => {
  assert.match(cards, /\.\.\.todayCard,\s*\{ title: dt\("تبرعات ناجحة"\)/);
  assert.match(page, /fetchChartData\(\),\s*fetchTodayData\(\),/);
  assert.doesNotMatch(cards + todayFetch, /\/api\/admin\/dashboard-summary/);
});
