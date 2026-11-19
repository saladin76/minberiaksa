import test from "node:test";
import assert from "node:assert/strict";
import { classifySourceChannel as c } from "../../lib/attribution/source-channel";
import { donationSourceWhere } from "../../lib/dashboard/donation-source-filter";

test("tagged sources seen in production map to their channel", () => {
  assert.equal(c({ utm_source: "fb", utm_medium: "paid_social", platform: "meta" }), "facebook");
  assert.equal(c({ utm_source: "Meta", utm_medium: "Paid" }), "facebook");
  assert.equal(c({ utm_source: "an" }), "facebook", "Meta Audience Network");
  assert.equal(c({ utm_source: "ig", platform: "ig" }), "instagram");
  assert.equal(c({ utm_source: "whatsapp", utm_medium: "messaging", utm_campaign: "whatsapp-campaign" }), "whatsapp");
  assert.equal(c({ utm_source: "email", utm_medium: "communication", utm_id: "6af6fb5b6743493af15c54ab" }), "email");
  assert.equal(c({ utm_source: "Email", utm_medium: "friday_email" }), "email");
  assert.equal(c({ utm_source: "google", utm_medium: "cpc" }), "google_ads");
  assert.equal(c({ platform: "google_ads" }), "google_ads");
  assert.equal(c({ utm_source: "chatgpt.com" }), "other");
});

test("untagged visits fall back to click ids, then the referrer", () => {
  assert.equal(c({ first_landing_page: "https://minberiaksa.org/ar?gclid=abc", session_id: "s" }), "google_ads");
  assert.equal(c({ first_referrer: "https://l.instagram.com/", landing_page: "https://minberiaksa.org/ar" }), "instagram");
  assert.equal(c({ first_referrer: "https://lm.facebook.com/", landing_page: "https://minberiaksa.org/ar" }), "facebook");
  assert.equal(c({ first_referrer: "android-app://com.google.android.gm/", landing_page: "https://minberiaksa.org/ar" }), "email");
  assert.equal(c({ first_referrer: "https://www.google.com/", landing_page: "https://minberiaksa.org/ar" }), "google_search");
  assert.equal(c({ first_referrer: "https://www.paypal.com/", landing_page: "https://minberiaksa.org/ar" }), "direct", "a payment return is not a source");
  assert.equal(c({ first_referrer: "https://minberiaksa.org/ar/bagislar", landing_page: "https://minberiaksa.org/ar" }), "direct", "own site");
  assert.equal(c({ landing_page: "https://minberiaksa.org/ar", session_id: "s" }), "direct");
});

test("no attribution is unknown, never guessed", () => {
  assert.equal(c(null), "unknown");
  assert.equal(c({}), "unknown");
});

test("the filter accepts only known channels", () => {
  assert.deepEqual(donationSourceWhere("instagram"), { sourceChannel: "instagram" });
  assert.equal(donationSourceWhere("all"), null);
  assert.equal(donationSourceWhere("<script>"), null);
});

import fs from "node:fs";
test("chart, list and export apply the source filter; the page offers it and keeps the chart type beside the chart", () => {
  assert.match(fs.readFileSync("app/api/admin/donations/chart/route.ts", "utf8"), /mergeDonationSourceFilter\(mergeDonationProviderFilter\(/);
  assert.match(fs.readFileSync("app/api/donations/route.ts", "utf8"), /statusWhere, providerWhere, sourceWhere, accountingWhere/);
  assert.match(fs.readFileSync("app/api/admin/donations/export/route.ts", "utf8"), /donationSourceWhere\(sp\.get\("source"\)\)/);
  const page = fs.readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
  assert.equal((page.match(/source: donationSourceFilter/g) ?? []).length, 3, "chart, revenue split and list scopes");
  assert.match(page, /\{dt\("مصدر التبرع"\)\}/);
  assert.match(page, /<\/TabsList>\s*<Select value=\{chartView\}/, "chart type sits with the chart controls");
  assert.doesNotMatch(page, /\{\/\* Chart Type \*\/\}/, "and no longer in the filters grid");
});

test("the classification job is cron-protected and writes only sourceChannel", () => {
  const job = fs.readFileSync("app/api/cron/donation-source/route.ts", "utf8");
  assert.match(job, /timingSafeEqual/);
  assert.match(job, /\$set: \{ sourceChannel: channel \}/);
  assert.doesNotMatch(job, /\$unset|deleteMany|\$set: \{ (status|paidAt|amount)/);
});

import { SOURCE_CHANNELS } from "../../lib/attribution/source-channel";
test("the donations list's inline source list is exactly the classifier's", () => {
  const route = fs.readFileSync("app/api/donations/route.ts", "utf8");
  const m = /const DONATION_SOURCE_CHANNELS: readonly string\[\] = (\[[^\]]*\]);/.exec(route);
  assert.ok(m, "inline list present");
  assert.deepEqual(JSON.parse(m[1]), [...SOURCE_CHANNELS]);
});
