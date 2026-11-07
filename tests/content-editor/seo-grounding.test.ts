import test from "node:test";
import assert from "node:assert/strict";
import { groundedSeo, seoGroundingFields } from "../../lib/content-editor/seo-grounding";
import type { SeoSuggestion } from "../../lib/content-editor/seo-research";

const source = "طرود غذائية لأهل غزة. يوفر المشروع مواد غذائية أساسية ومتنوعة للأسر المحتاجة في غزة.";
const sources = [{ url: "https://example.org/gaza-food-assistance", title: "Gaza food assistance" }, { url: "https://example.org/church-seo", title: "Church SEO" }];
const copy: SeoSuggestion = { seoTitle: "Food parcels for Gaza", metaDescription: "Support essential food parcels for families in Gaza.", primaryKeyword: "Gaza food parcels", keywords: [], longTailKeywords: [], altText: "Food parcels", faq: [{ question: "Who benefits?", answer: "Families in Gaza." }], schemaType: "DonateAction", notes: [] };
const review = (value = copy) => ({ checks: seoGroundingFields(value).map(field => ({ key: field.key, supported: true, evidenceQuotes: [source] })), relevantSourceUrls: [sources[0].url] });
test("independent review strips an external institution, invented contents and all-donations promises from FAQ", () => {
  for (const answer of ["Donate through Palestinian Food Bank and visit their website.", "Each parcel contains rice, lentils and olive oil.", "Tous les dons sont utilisés pour acheter et distribuer les colis."]) {
    const draft = { ...copy, faq: [{ question: "How do I donate?", answer }] }, verdict = review(draft);
    verdict.checks.find(check => check.key === "faq.0.answer")!.supported = false;
    const result = groundedSeo(draft, source, verdict, sources);
    assert.deepEqual(result.unsafeRequired, []); assert.deepEqual(result.suggestion.faq, []);
    assert.doesNotMatch(JSON.stringify(result.suggestion), /Palestinian Food Bank|lentils|Tous les dons/);
    assert.deepEqual(result.sources, [sources[0]]);
  }
});
test("missing, duplicate, forged or unrelated evidence cannot certify the required metadata", () => {
  for (const verdict of [{}, { checks: [{ key: "seoTitle", supported: true, evidenceQuotes: ["invented source"] }] }, { checks: [...review().checks, review().checks[0]] }]) {
    assert.ok(groundedSeo(copy, source, verdict, sources).unsafeRequired.includes("seoTitle"));
  }
});
test("a positive reviewer verdict cannot smuggle a new donation URL or numeric guarantee", () => {
  for (const metaDescription of ["Donate at https://other.example/donate", "100% of your donation reaches Gaza families."]) {
    const draft = { ...copy, metaDescription };
    assert.deepEqual(groundedSeo(draft, source, review(draft), sources).unsafeRequired, ["metaDescription"]);
  }
});
test("review cannot invent source links or retain irrelevant evidence", () => {
  const result = groundedSeo(copy, source, { ...review(), relevantSourceUrls: ["https://unknown.example/food"] }, sources);
  assert.deepEqual(result.sources, []);
});
