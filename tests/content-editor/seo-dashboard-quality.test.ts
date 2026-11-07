import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { reviewSeoDraft, reviewSeoSuggestion } from "../../app/api/admin/seo/seo-dashboard-quality";

const codes = (issues: ReturnType<typeof reviewSeoDraft>) => issues.map((issue) => issue.code);

test("SEO dashboard audit accepts 19 supported locales without translating or sharing content", () => {
  assert.equal(SUPPORTED_LOCALES.length, 19);
  for (const locale of SUPPORTED_LOCALES) {
    const issues = reviewSeoDraft({
      locale, seoTitle: "Support families through verified humanitarian projects",
      metaDescription: "Learn about available humanitarian assistance projects and ways to support families with relevant, clear information.",
      ogImage: "/images/appeal.jpg", imageAlt: "Distribution of assistance at a community center",
      seoNoIndex: "false",
    });
    assert.ok(!codes(issues).includes("noindex-enabled"), locale);
    assert.ok(!codes(issues).includes("unsafe-og-url"), locale);
  }
});

test("SEO dashboard distinguishes 42/90 CJK preview limits from other languages", () => {
  const input = {
    seoTitle: "A".repeat(50), metaDescription: "B".repeat(100), ogImage: "https://example.org/og.jpg", imageAlt: "A real scene",
  };
  assert.ok(codes(reviewSeoDraft({ ...input, locale: "ja" })).includes("title-too-long"));
  assert.ok(codes(reviewSeoDraft({ ...input, locale: "zh" })).includes("description-too-long"));
  assert.ok(!codes(reviewSeoDraft({ ...input, locale: "en" })).includes("title-too-long"));
  assert.ok(!codes(reviewSeoDraft({ ...input, locale: "en" })).includes("description-too-long"));
});

test("SEO dashboard marks deliberate noindex and warns if an OG image has no alt", () => {
  const issues = reviewSeoDraft({
    locale: "ar", seoTitle: "مبادرات إنسانية لدعم الأسر في غزة",
    metaDescription: "تعرف على المشاريع الإنسانية ومجالات الدعم المتاحة للأسر المحتاجة والمبادرات المرتبطة بها.",
    ogImage: "https://minberiaksa.org/photo.jpg", seoNoIndex: "true",
  });
  assert.ok(codes(issues).includes("noindex-enabled"));
  assert.ok(codes(issues).includes("missing-alt"));
});

test("SEO dashboard warns about missing values, page title mismatch and keyword stuffing", () => {
  const issues = reviewSeoDraft({
    locale: "ar", contentTitle: "ترميم منازل القدس",
    seoTitle: "مبادرة أخرى للمياه", metaDescription: "تبرع للمياه. تبرع للمياه. تبرع للمياه. تبرع للمياه.",
    seoKeyword: "تبرع للمياه",
  });
  assert.ok(codes(issues).includes("title-context-mismatch"));
  assert.ok(codes(issues).includes("keyword-stuffing"));
  assert.ok(issues.find((item) => item.code === "keyword-stuffing")?.severity === "error");
  const empty = reviewSeoDraft({ locale: "ar" });
  assert.ok(codes(empty).includes("missing-title"));
  assert.ok(codes(empty).includes("missing-description"));
});

test("SEO dashboard rejects untrusted OG protocols but accepts internal and HTTPS images", () => {
  for (const link of ["javascript:alert(1)", "data:image/svg+xml,abc", "//example.net/image.jpg", "http://example.com/cover.png"]) {
    assert.ok(codes(reviewSeoDraft({ locale: "en", ogImage: link })).includes("unsafe-og-url"));
  }
  for (const link of ["/uploads/cover.png", "https://minberiaksa.org/cover.webp"]) {
    assert.ok(!codes(reviewSeoDraft({ locale: "en", ogImage: link })).includes("unsafe-og-url"));
  }
});

test("SEO dashboard preserves damaged FAQ and identifies partial questions", () => {
  assert.ok(codes(reviewSeoDraft({ locale: "ar", faqContent: "{" })).includes("invalid-faq"));
  assert.ok(codes(reviewSeoDraft({ locale: "ar", faqContent: '[{"q":"سؤال","a":""}]' })).includes("incomplete-faq"));
  assert.ok(!codes(reviewSeoDraft({ locale: "ar", faqContent: '[{"q":"سؤال","a":"إجابة"}]' })).includes("invalid-faq"));
});

test("SEO AI suggestion rejects figures not present in the approved source in Arabic or Latin digits", () => {
  const source = { title: "غزة", description: "500 أسرة تحتاج إلى مساعدات" };
  assert.ok(codes(reviewSeoSuggestion(source, { seoTitle: "مساعدة 500 أسرة", metaDescription: "ساعد ٥٠٠ أسرة" }, "ar")).every((code) => code !== "unsupported-number"));
  assert.ok(codes(reviewSeoSuggestion(source, { seoTitle: "مساعدة 500 أسرة", metaDescription: "ساهم في دعم 600 أسرة" }, "ar")).includes("unsupported-number"));
});

test("SEO AI suggestions refuse unsupported absolute promises but keep an explicit source claim", () => {
  const source = { title: "Humanitarian project", description: "Read about this project and its activity." };
  assert.ok(codes(reviewSeoSuggestion(source, { seoTitle: "100% guaranteed donations" }, "en")).includes("unsupported-absolute-claim"));
  const documented = { title: "مشروع", description: "100% من موارد هذا المشروع تصرف للتنفيذ" };
  assert.ok(!codes(reviewSeoSuggestion(documented, { seoTitle: "مشروع", metaDescription: "100% من موارد المشروع للتنفيذ" }, "ar")).includes("unsupported-absolute-claim"));
});
