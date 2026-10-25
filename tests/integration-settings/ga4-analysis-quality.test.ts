import assert from "node:assert/strict";
import test from "node:test";
import { analyzeGa4Report, ga4AnalysisEvidence } from "../../lib/marketing/ga4-analysis";
import { fetchGa4Extended } from "../../lib/marketing/ga4-extended";
import { parseGa4BatchResponse } from "../../lib/marketing/ga4-reporting";

function reportFixture() {
  const report = parseGa4BatchResponse({ reports: [] });
  report.pages = [{ pagePath: "/ar", pageTitle: "Home", screenPageViews: 10, sessions: 8, activeUsers: 7 }];
  return report;
}
function responseFixture(area: "measurement" | "seo" | "ux" = "measurement", evidenceIds = ["e2"]) {
  return { summary: "توجد زيارات مسجلة خلال الفترة.", opportunities: [{ area, title: "مراجعة الصفحة", finding: "الصفحة تستقبل زيارات.", action: "اختبر تحسين الصفحة.", evidenceIds, confidence: "high" }], limitations: ["البيانات لا تثبت أسباب السلوك."] };
}
async function analyze(response: ReturnType<typeof responseFixture>, report = reportFixture(), inspect?: (body: {store?: boolean; input: {content: string}[]}) => void) {
  return analyzeGa4Report({ report, period: { range: "28d" }, locale: "ar", model: "fixture", baseUrl: "https://fixture.example/v1", apiKey: "fixture", fetchImpl: async (_url, init) => {
    inspect?.(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ output_text: JSON.stringify(response) }));
  } });
}
test("Arabic analysis requests a full language name, no storage, and measured-claim rules", async () => {
  await analyze(responseFixture(), reportFixture(), body => {
    assert.equal(body.store, false);
    assert.match(body.input[0].content, /Arabic/);
    assert.match(body.input[0].content, /every narrative field/);
    assert.match(body.input[0].content, /emit no SEO opportunities/);
    assert.match(body.input[0].content, /user dissatisfaction/);
  });
});
test("an English narrative is rejected rather than shown as a successful Arabic analysis", async () => {
  const reply = responseFixture(); reply.summary = "The website has visitors.";
  await assert.rejects(analyze(reply), /AI_INVALID_ANALYSIS/);
});
test("SEO findings cannot cite GA4 traffic as evidence of organic underperformance", async () => {
  await assert.rejects(analyze(responseFixture("seo")), /INVALID_EVIDENCE/);
});
test("available Search Console still requires organic evidence on every SEO opportunity", async () => {
  const report = reportFixture();
  report.organicSearch = { status: "ready", timezone: "America/Los_Angeles", rows: [{ query: "water", pagePath: "/ar", clicks: 1, impressions: 10, ctr: 0.1, position: 5 }] };
  await assert.rejects(analyze(responseFixture("seo"), report), /INVALID_EVIDENCE/);
  const id = ga4AnalysisEvidence(report).find(row => row.dataset === "searchConsoleQueries")!.id;
  const result = await analyze(responseFixture("seo", [id]), report);
  assert.equal(result.analysis.opportunities[0].area, "seo");
});
test("UX proposals are explicitly hypotheses with low confidence", async () => {
  const result = await analyze(responseFixture("ux"));
  assert.match(result.analysis.opportunities[0].finding, /^فرضية تحتاج اختبارًا:/);
  assert.equal(result.analysis.opportunities[0].confidence, "low");
});
test("cached blank search rows never enter model evidence", () => {
  const report = reportFixture();
  report.extended = { siteSearch: { rows: ["", " ", "(not set)", "(not provided)", "غزة"].map(value => ({ dimensions: [value], metrics: [100, 10] })), rowCount: 5, thresholded: false, sampled: false } };
  const rows = ga4AnalysisEvidence(report).filter(row => row.dataset === "siteSearch");
  assert.deepEqual(rows.map(row => row.label), ["غزة"]);
});
test("site-search report filters search events and missing terms before ranking", async () => {
  let searchChecked = false;
  const result = await fetchGa4Extended({ propertyId: "fixture", accessToken: "fixture", range: "28d", fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ reports: body.requests.map((request: { dimensions: {name: string}[]; metrics: {name: string}[]; dimensionFilter?: {andGroup: {expressions: [{filter: {inListFilter: {values: string[]}}}, {notExpression: {filter: {fieldName: string}}}]}} }) => {
      const isSearch = request.dimensions[0].name === "searchTerm";
      if (isSearch) {
        searchChecked = true;
        assert.deepEqual(request.dimensionFilter!.andGroup.expressions[0].filter.inListFilter.values, ["view_search_results", "search"]);
        assert.equal(request.dimensionFilter.andGroup.expressions[1].notExpression.filter.fieldName, "searchTerm");
      } else assert.equal(request.dimensionFilter, undefined);
      const terms = isSearch ? ["", "(not set)", "غزة"] : ["fixture"];
      return { rows: terms.map(value => ({ dimensionValues: request.dimensions.map(() => ({value})), metricValues: request.metrics.map(() => ({ value: "2" })) })), rowCount: terms.length };
    }) }));
  } });
  assert.equal(searchChecked, true);
  assert.deepEqual(result.siteSearch?.rows.map(row => row.dimensions[0]), ["غزة"]);
});
