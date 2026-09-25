import test from "node:test";
import assert from "node:assert/strict";
import { matchTopic, resolveTopic, pickCrossSell, rankCampaigns, rankCategories, type CatalogCampaign, type CatalogCategory } from "../../lib/ai/concierge/recommend";
import { llmVerdictSchema, conciergeRequestSchema } from "../../lib/ai/concierge/schema";

/**
 * Candidate selection is deterministic and fact-based; the model only picks
 * among what this produces. These pin the ranking signals and the contract
 * that rejects malformed model output.
 */

function campaign(over: Partial<CatalogCampaign> & { id: string }): CatalogCampaign {
  return {
    slug: over.id,
    title: over.id,
    summary: "",
    image: null,
    categorySlugs: [],
    categoryIds: [],
    regionSlug: null,
    regionLabel: null,
    priority: 10,
    raisedUSD: 0,
    goalUSD: null,
    suggestedAmountsUSD: [50, 100],
    supportsShares: false,
    sharePriceUSD: null,
    createdAt: 1,
    ...over,
  };
}

const CATALOG: CatalogCampaign[] = [
  campaign({ id: "a1", title: "بئر ماء في غزة", categorySlugs: ["region-gaza", "type-waqf"], regionSlug: "region-gaza", priority: 5 }),
  campaign({ id: "b2", title: "سلال غذائية عاجلة", summary: "إغاثة طوارئ", categorySlugs: ["region-gaza", "type-sadaqah"], regionSlug: "region-gaza", priority: 1 }),
  campaign({ id: "c3", title: "ترميم بيوت القدس", categorySlugs: ["region-al-quds", "type-waqf", "type-recurring"], regionSlug: "region-al-quds", priority: 2, supportsShares: true, sharePriceUSD: 100 }),
  campaign({ id: "d4", title: "كفالة أيتام الصومال", categorySlugs: ["region-somalia", "type-recurring"], regionSlug: "region-somalia", priority: 20 }),
];

test("sadaqah jariyah prefers waqf-tagged and lasting projects", () => {
  const ids = rankCampaigns(CATALOG, { intent: "sadaqah_jariyah", region: null, amountUSD: 500, text: null }, 3).map((r) => r.campaign.id);
  assert.deepEqual(ids.slice(0, 2).sort(), ["a1", "c3"]);
  assert.ok(!ids.includes("b2") || ids.indexOf("b2") > 1);
});

test("relief prefers relief wording; region words dominate", () => {
  const relief = rankCampaigns(CATALOG, { intent: "relief", region: null, amountUSD: null, text: null }, 1);
  assert.equal(relief[0].campaign.id, "b2");
  const quds = rankCampaigns(CATALOG, { intent: "relief", region: "al-quds", amountUSD: null, text: null }, 1);
  assert.equal(quds[0].campaign.id, "c3");
});

test("a budget below the share price pushes a share project down", () => {
  const ids = rankCampaigns(CATALOG, { intent: "sadaqah_jariyah", region: null, amountUSD: 20, text: null }, 3).map((r) => r.campaign.id);
  assert.equal(ids[0], "a1");
});

test("a visitor's own situation reaches the project that fits it", () => {
  const withEducation = [...CATALOG, campaign({ id: "e5", title: "رعاية تعليم طلاب القدس", summary: "دعم الطلاب ومصاريف الدراسة", categorySlugs: ["region-al-quds", "type-sadaqah"], regionSlug: "region-al-quds", priority: 30 })];
  const student = rankCampaigns(withEducation, { intent: null, region: null, amountUSD: null, text: "أنا في ثانوية عامة مش عارف اذاكر" }, 1);
  assert.equal(student[0].campaign.id, "e5");
  const english = rankCampaigns(withEducation, { intent: null, region: null, amountUSD: null, text: "my exams are next week and I'm stressed" }, 1);
  assert.equal(english[0].campaign.id, "e5");
  const loss = rankCampaigns(withEducation, { intent: null, region: null, amountUSD: null, text: "والدي توفي الأسبوع الماضي" }, 1);
  assert.ok(["a1", "c3"].includes(loss[0].campaign.id), "a loss points at lasting-charity projects");
});

test("exclusions honoured and empty matches fall back to the admin order", () => {
  const ids = rankCampaigns(CATALOG, { intent: null, region: null, amountUSD: null, text: null, excludeIds: ["b2"] }, 2).map((r) => r.campaign.id);
  assert.ok(!ids.includes("b2"));
  assert.equal(ids[0], "c3", "priority 2 first once priority 1 is excluded");
});

test("cross-sell: admin list first, never something already in the basket", () => {
  const pick = pickCrossSell(CATALOG, ["b2", "a1"], "b2", ["b2"]);
  assert.equal(pick?.id, "a1");
  const sameRegion = pickCrossSell(CATALOG, [], "a1", ["a1"]);
  assert.equal(sameRegion?.id, "b2");
});

test("a wish is matched at its own width: projects, one area, or several areas", () => {
  const cats: CatalogCategory[] = [
    { id: "c-orph", slug: "type-orphans", title: "كفالة الأيتام", kind: "type", projectCount: 2, canDonateDirectly: false },
    { id: "c-edu", slug: "type-education", title: "التعليم", kind: "type", projectCount: 1, canDonateDirectly: false },
    { id: "c-gaza", slug: "region-gaza", title: "غزة", kind: "region", projectCount: 3, canDonateDirectly: false },
  ];
  const catalog = [
    campaign({ id: "o1", title: "كفالة يتيم في غزة", categoryIds: ["c-orph", "c-gaza"] }),
    campaign({ id: "o2", title: "كسوة الأيتام", categoryIds: ["c-orph"] }),
    campaign({ id: "e1", title: "منح دراسية للطلاب", summary: "دعم تعليم الطلاب", categoryIds: ["c-edu"] }),
    campaign({ id: "w1", title: "بئر ماء", categoryIds: ["c-gaza"] }),
  ];
  const orphans = matchTopic(catalog, cats, "عايز اتبرع للأيتام");
  assert.equal(orphans.categories[0].category.id, "c-orph", "the area named in the wish comes first");
  assert.ok(orphans.categories[0].strong);
  assert.ok(!orphans.categories.some((c) => c.category.id === "c-edu"), "an unrelated area is not offered");
  const well = matchTopic(catalog, cats, "the بئر ماء project");
  assert.equal(well.campaigns[0].campaign.id, "w1", "a named project is found");
  const student = matchTopic(catalog, cats, "أنا طالب وعايز اتبرع لحاجة زي التعليم");
  assert.equal(student.categories[0].category.id, "c-edu");
  assert.deepEqual(matchTopic(catalog, cats, "hello").campaigns, []);
  /* The one answer: named areas set the width unless the rest singles out projects. */
  assert.deepEqual(resolveTopic(catalog, cats, "عايز اتبرع لغزة أو الأيتام"), { kind: "categories", ids: ["c-orph", "c-gaza"], named: true });
  assert.deepEqual(resolveTopic(catalog, cats, "عايز اتبرع للأيتام"), { kind: "category", id: "c-orph" });
  assert.deepEqual(resolveTopic(catalog, cats, "عايز اتبرع لكسوة الأيتام"), { kind: "campaigns", ids: ["o2"] });
  assert.deepEqual(resolveTopic(catalog, cats, "بئر ماء"), { kind: "campaigns", ids: ["w1"] });
  assert.equal(resolveTopic(catalog, cats, "عايز اتبرع"), null);
});

test("categories: intent types first, then by project count", () => {
  const cats: CatalogCategory[] = [
    { id: "1", slug: "region-gaza", title: "غزة", kind: "region", projectCount: 4, canDonateDirectly: false },
    { id: "2", slug: "type-waqf", title: "وقف", kind: "type", projectCount: 2, canDonateDirectly: false },
    { id: "3", slug: "type-zakat", title: "زكاة", kind: "type", projectCount: 0, canDonateDirectly: true },
  ];
  assert.equal(rankCategories(cats, "waqf", 2)[0].slug, "type-waqf");
  assert.equal(rankCategories(cats, null, 3)[0].kind, "type");
});

test("malformed model output is rejected", () => {
  assert.equal(llmVerdictSchema.safeParse({ intent: "zakat" }).success, false);
  const base = { mode: "recommend", answer: "", route: null, needsHuman: false, supportSubject: null, ticketDraft: "", ticketAboutDonation: false, command: { kind: "none", locale: null, currency: null, name: null, phone: null, email: null, planId: null, planAmount: null, planFrequency: null, planStatus: null }, donationId: null, suggestion: { kind: "none", campaignId: null, text: "" }, amount: null, currency: null, frequency: null, region: null, giftRecipientName: null, recommendedIds: [], categorySlugs: [], reasons: [], message: "", needsRuling: false };
  assert.equal(llmVerdictSchema.safeParse({ ...base, intent: "buy_stuff" }).success, false);
  assert.equal(llmVerdictSchema.safeParse({ ...base, intent: "relief", mode: "chat" }).success, false, "unknown mode");
  assert.equal(llmVerdictSchema.safeParse({ ...base, intent: "relief", route: "/admin" }).success, false, "route must be a known page");
  assert.equal(llmVerdictSchema.safeParse({ ...base, intent: "relief", recommendedIds: ["b2"], reasons: { b2: "x" } }).success, false, "a map of reasons is the old shape");
  const ok = llmVerdictSchema.safeParse({ ...base, intent: "relief", mode: "answer_then_recommend", answer: "Yes.", route: "reports", amount: 100, currency: "USD", region: "gaza", recommendedIds: ["b2"], reasons: [{ id: "b2", reason: "x" }], message: "hi" });
  assert.equal(ok.success, true);
});

test("requests need a session, a locale and either a message or a step", () => {
  assert.equal(conciergeRequestSchema.safeParse({ sessionId: "abcdefgh1234", locale: "ar" }).success, false);
  assert.equal(conciergeRequestSchema.safeParse({ sessionId: "short", locale: "ar", step: { kind: "open" } }).success, false);
  assert.equal(conciergeRequestSchema.safeParse({ sessionId: "abcdefgh1234", locale: "ar", step: { kind: "open" } }).success, true);
  assert.equal(conciergeRequestSchema.safeParse({ sessionId: "abcdefgh1234", locale: "en", message: "x".repeat(601) }).success, false);
  assert.equal(conciergeRequestSchema.safeParse({ sessionId: "abcdefgh1234", locale: "en", step: { kind: "select_campaign", campaignId: "not-an-id" } }).success, false);
});
