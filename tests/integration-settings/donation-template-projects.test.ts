import assert from "node:assert/strict";
import test from "node:test";
import { donationProjectSummary } from "../../lib/templates/donation-projects";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { buildStandardMetaComponents } from "../../lib/communication/meta-template-components";

test("category-only donations have their actual destination instead of a missing project", () => {
  const result = donationProjectSummary({
    locale: "ar", items: [],
    categoryItems: [{ amount: 100, amountUSD: 100, category: { name: "الزكاة" } }],
  });
  assert.equal(result.campaignTitle, "الزكاة");
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].amount, 100);
});

test("mixed campaign, category and waqf destinations are preserved with original amounts", () => {
  const result = donationProjectSummary({
    locale: "en", items: [{ amount: 5, amountUSD: 5, campaign: { title: "Water" } }],
    categoryItems: [{ amount: 10, amountUSD: 10, category: { name: "Gaza" } }],
    waqfItems: [{ amount: 100, amountUSD: 100, unit: "SHARE", count: 1 }],
  });
  assert.equal(result.campaignTitle, "Water، Gaza، Waqf share");
  assert.equal(result.lines.length, 3);
  assert.deepEqual(result.lines.map((x) => x.amount), [5, 10, 100]);
  assert.equal(result.lines[2].shareCount, 1);
});

test("waqf-only donation is labelled by its actual unit and language", () => {
  const result = donationProjectSummary({
    locale: "tr", items: [], waqfItems: [{ amount: 1500, amountUSD: 1500, unit: "METER", count: 1 }],
  });
  assert.equal(result.campaignTitle, "Vakıf metre bağışı");
});

test("empty legacy project data has a nonempty fallback in all 19 locales without inventing lines", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const result = donationProjectSummary({ locale, items: [] });
    assert.ok(result.campaignTitle.trim(), locale);
    assert.equal(result.lines.length, 0);
  }
  assert.equal(donationProjectSummary({ locale: "en_US", items: [] }).campaignTitle, "General donation");
  assert.equal(donationProjectSummary({ locale: "unknown", items: [] }).campaignTitle, "تبرع عام");
  assert.equal(donationProjectSummary({ items: [{ amount: 1, amountUSD: null, campaign: null }] }).campaignTitle, "تبرع عام");
});

test("a legacy donation without campaign lines can fill the approved WhatsApp project parameter", () => {
  const summary = donationProjectSummary({ locale: "ar", items: [] });
  const template = buildStandardMetaComponents({
    body: "المشروع: {{donation.campaignTitle}}", header: { type: "NONE" }, headerText: "", footerText: "", buttons: [],
  });
  const sent = buildMetaComponents({
    componentsSchema: template.components,
    values: { "donation.campaignTitle": summary.campaignTitle },
    positionalNames: ["donation.campaignTitle"],
  });
  assert.equal(sent.ok, true);
});
