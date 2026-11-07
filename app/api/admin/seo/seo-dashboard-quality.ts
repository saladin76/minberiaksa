/**
 * Read-only, locale-scoped editorial checks for dashboard SEO.
 * This module intentionally has no DB, translation, provider or publishing side effects.
 */
export type SeoReviewIssue = {
  code: string;
  field: string;
  severity: "error" | "warning";
  message: string;
};

export type SeoReviewInput = {
  locale: string;
  contentTitle?: string | null;
  seoTitle?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  seoDescription?: string | null;
  seoKeyword?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  imageAlt?: string | null;
  seoNoIndex?: string | boolean | null;
  faqContent?: string | null;
  checkImageAlt?: boolean;
};

const chars = (value: string) => Array.from(value.trim()).length;
const text = (value: string | null | undefined) => (value || "").trim();
const numeric = (value: string) => value.normalize("NFKC")
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
const plain = (value: string) => numeric(value).toLocaleLowerCase().replace(/\s+/g, " ").trim();
const titleMax = (locale: string) => locale === "ja" || locale === "zh" ? 42 : 70;
const descriptionMax = (locale: string) => locale === "ja" || locale === "zh" ? 90 : 160;
const numbers = (value: string) => numeric(value).match(/\d+(?:[.,]\d+)?/g) || [];
const absoluteClaims = /(?:\bguaranteed\b|\b100\s*%|\b#1\b|\bbest\s+in\s+the\s+world\b|مضمون(?:ة|ون)?|مئة\s*بالمئة|١٠٠\s*٪|100\s*%|الأفضل\s+في\s+العالم)/i;

export function reviewSeoDraft(input: SeoReviewInput): SeoReviewIssue[] {
  const issues: SeoReviewIssue[] = [];
  const add = (code: string, field: string, message: string, severity: SeoReviewIssue["severity"] = "warning") =>
    issues.push({ code, field, severity, message });
  const title = text(input.seoTitle || input.metaTitle);
  const description = text(input.seoDescription || input.metaDescription);
  const contentTitle = text(input.contentTitle);
  const keyword = text(input.seoKeyword).split(/[,،\n]/)[0].trim();
  if (!title) add("missing-title", "seoTitle", "عنوان البحث غير موجود في هذه اللغة.");
  else {
    if (chars(title) > titleMax(input.locale)) add("title-too-long", "seoTitle", "عنوان البحث طويل وقد يُختصر في النتيجة.");
    if (chars(title) < 20) add("title-too-short", "seoTitle", "عنوان البحث قصير؛ تحقق من وضوح موضوع الصفحة ونية الباحث.");
  }
  if (!description) add("missing-description", "metaDescription", "وصف البحث غير موجود في هذه اللغة.");
  else {
    if (chars(description) > descriptionMax(input.locale)) add("description-too-long", "metaDescription", "الوصف طويل؛ قد لا تظهر نهايته في نتائج البحث.");
    if (chars(description) < 60) add("description-too-short", "metaDescription", "الوصف قصير؛ وضّح القيمة الحقيقية للصفحة دون حشو.");
  }
  if (contentTitle && title && plain(contentTitle) !== plain(title)) {
    const informative = plain(contentTitle).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4);
    if (informative.length && !informative.some((word) => plain(title).includes(word)))
      add("title-context-mismatch", "seoTitle", "عنوان SEO بعيد عن اسم المحتوى. تأكد من أنه يصف الصفحة نفسها ولا يعد بشيء مختلف.");
  }
  if (keyword && keyword.length >= 3) {
    const occurrences = plain(title + " " + description).split(plain(keyword)).length - 1;
    if (occurrences >= 4) add("keyword-stuffing", "seoKeyword", "تكرار مبالغ فيه للعبارة المستهدفة؛ أعد صياغتها بصورة طبيعية.", "error");
    else if (occurrences === 0) add("keyword-missing", "seoKeyword", "العبارة الرئيسية لا تظهر في العنوان أو الوصف. راجع مدى ملاءمتها لنية البحث.");
  }
  if (absoluteClaims.test(title + " " + description))
    add("claim-needs-source", "metaDescription", "يوجد ادعاء مطلق أو ضمان؛ يلزم دليل موثوق قبل اعتماده.");
  const ogImage = text(input.ogImage);
  if (ogImage) {
    if (!(/^\//.test(ogImage) && !/^\/\//.test(ogImage)) && !/^https:\/\//i.test(ogImage))
      add("unsafe-og-url", "ogImage", "رابط صورة المشاركة يجب أن يبدأ بـ https:// أو بمسار داخلي /.", "error");
    if (input.checkImageAlt !== false && !text(input.imageAlt))
      add("missing-alt", "imageAlt", "أضف وصفًا دقيقًا للصورة يصف محتواها الفعلي، لا مجرد كلمات مفتاحية.");
  } else {
    add("missing-og-image", "ogImage", "لا توجد صورة مشاركة مخصصة. تأكد من ملاءمة الصورة الافتراضية لهذه اللغة.");
  }
  if (input.seoNoIndex === true || input.seoNoIndex === "true")
    add("noindex-enabled", "seoNoIndex", "هذه اللغة مضبوطة على Noindex؛ تأكد أن منع فهرستها مقصود.", "warning");
  if (input.faqContent && input.faqContent.trim()) {
    try {
      const faq: unknown = JSON.parse(input.faqContent);
      if (!Array.isArray(faq)) throw new Error("FAQ must be an array");
      if (faq.some((item) => !item || typeof item !== "object" || !("q" in item) || !("a" in item) ||
        typeof item.q !== "string" || typeof item.a !== "string" || !item.q.trim() || !item.a.trim()))
        add("incomplete-faq", "faqContent", "توجد أسئلة شائعة غير مكتملة؛ لن تكون صالحة للمراجعة أو البيانات المنظمة.");
    } catch {
      add("invalid-faq", "faqContent", "تنسيق الأسئلة الشائعة غير صالح؛ لا تمسح النص قبل إصلاحه.", "error");
    }
  }
  return issues;
}

/** Provider suggestions containing fresh figures or unsupported absolute claims must not enter drafts. */
export function reviewSeoSuggestion(
  source: { title: string; description: string },
  suggestion: { seoTitle?: string; metaDescription?: string; altText?: string },
  locale: string,
): SeoReviewIssue[] {
  const copy = [suggestion.seoTitle || "", suggestion.metaDescription || "", suggestion.altText || ""].join(" ");
  const known = new Set(numbers(source.title + " " + source.description));
  const unexpected = [...new Set(numbers(copy))].filter((number) => !known.has(number));
  const issues = reviewSeoDraft({ locale, seoTitle: suggestion.seoTitle, metaDescription: suggestion.metaDescription, checkImageAlt: false })
    .filter((issue) => issue.code === "keyword-stuffing" || issue.code === "title-too-long" || issue.code === "description-too-long");
  if (unexpected.length)
    issues.push({ code: "unsupported-number", field: "metaDescription", severity: "error",
      message: "اقتراح الذكاء الاصطناعي يتضمن رقمًا غير موجود في المصدر المعتمد: " + unexpected.join("، ") });
  if (absoluteClaims.test(copy) && !absoluteClaims.test(source.title + " " + source.description))
    issues.push({ code: "unsupported-absolute-claim", field: "metaDescription", severity: "error",
      message: "اقتراح الذكاء الاصطناعي يتضمن وعدًا أو ضمانًا مطلقًا غير موجود في المصدر." });
  return issues;
}
