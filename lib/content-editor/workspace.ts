import type { ContentKind, ContentRecord } from "./contracts";
import { parseSuggestedDonations } from "../campaign/suggested-donations";
import { parseSuggestedShareCounts } from "../campaign/campaign-modes";
export type EditorSection = { id: string; label: string; icon: string };
export const EDITOR_SECTIONS: Record<ContentKind, EditorSection[]> = {
  campaigns: [
    { id: "content", label: "المعلومات والمحتوى", icon: "file" },
    { id: "donation", label: "إعدادات التبرع", icon: "wallet" },
    { id: "media", label: "الصور والفيديو", icon: "image" },
    { id: "seo", label: "SEO والمشاركة", icon: "search" },
    { id: "history", label: "الإنجازات والسجل", icon: "history" },
  ],
  categories: [
    { id: "content", label: "التعريف والظهور", icon: "file" },
    { id: "library", label: "المشاريع وترتيبها", icon: "grid" },
    { id: "media", label: "الصورة والأيقونة", icon: "image" },
    { id: "seo", label: "SEO والمشاركة", icon: "search" },
    { id: "links", label: "الرابط وسجل التغييرات", icon: "link" },
    { id: "page", label: "إعدادات الصفحة الحالية", icon: "settings" },
  ],
  blog: [
    { id: "content", label: "المعلومات والمحتوى", icon: "file" },
    { id: "media", label: "الصورة والوسائط", icon: "image" },
    { id: "seo", label: "SEO والمشاركة", icon: "search" },
    { id: "review", label: "النشر والمراجعة", icon: "check" },
  ],
  "super-categories": [
    { id: "content", label: "التعريف واللغات", icon: "file" },
    { id: "media", label: "الواجهة والوسائط", icon: "image" },
    { id: "library", label: "المحتوى المرتبط", icon: "heart" },
    { id: "layout", label: "أقسام الصفحة", icon: "grid" },
    { id: "seo", label: "البحث والمشاركة", icon: "search" },
    { id: "review", label: "المراجعة والنشر", icon: "check" },
  ],
  "urgent-banners": [
    { id: "content", label: "النص واللغات", icon: "file" },
    { id: "links", label: "الأزرار والوجهات", icon: "link" },
    { id: "media", label: "الشكل والمبالغ", icon: "image" },
    { id: "display", label: "الظهور والجدولة", icon: "grid" },
    { id: "review", label: "المراجعة", icon: "check" },
  ],
};
export type SettingField = {
  key: string;
  label: string;
  section: string;
  type:
    | "text"
    | "number"
    | "boolean"
    | "url"
    | "image"
    | "images"
    | "numbers"
    | "ids"
    | "date"
    | "select";
  options?: [string, string][];
};
const field = (
  key: string,
  label: string,
  section: string,
  type: SettingField["type"] = "text",
  options?: [string, string][],
): SettingField => ({ key, label, section, type, options });
export const SETTING_FIELDS: Record<ContentKind, SettingField[]> = {
  campaigns: [
    field("categoryIds", "التصنيفات", "content", "ids"),
    field("isActive", "المشروع نشط ويستقبل التبرعات", "content", "boolean"),
    field("goalType", "نوع الهدف", "donation", "select", [
      ["OPEN", "هدف مفتوح"],
      ["FIXED", "هدف ثابت"],
    ]),
    field("targetAmount", "الهدف بالدولار", "donation", "number"),
    field("fundraisingMode", "طريقة التبرع", "donation", "select", [
      ["AMOUNT", "تبرع بمبلغ"],
      ["SHARES", "التبرع بالأسهم"],
    ]),
    field("sharePriceUSD", "سعر السهم بالدولار", "donation", "number"),
    field(
      "defaultDonationAmounts",
      "المبالغ الافتراضية (العملات دون تخصيص)",
      "donation",
      "numbers",
    ),
    field("defaultShareCounts", "أعداد الأسهم المقترحة", "donation", "numbers"),
    field("images", "صور المشروع", "media", "images"),
  ],
  categories: [
    field("isActive", "التصنيف نشط", "content", "boolean"),
    field(
      "navigationVisible",
      "إظهار التصنيف في قائمة التصنيفات",
      "content",
      "boolean",
    ),
    field("image", "صورة التصنيف", "media", "image"),
    field("icon", "الأيقونة", "media"),
    field("order", "ترتيب التصنيف", "content", "number"),
  ],
  blog: [
    field("image", "صورة المقال", "media", "image"),
    field("published", "نشر المقال", "review", "boolean"),
    field("categoryId", "تصنيف المقال", "review", "ids"),
    field("campaignIds", "المشاريع ذات الصلة (حتى ثلاثة)", "review", "ids"),
  ],
  "super-categories": [
    field("heroImage", "صورة الواجهة", "media", "image"),
    field("logoImage", "الشعار", "media", "image"),
    field("accentColor", "لون الواجهة", "media"),
    field("heroVideoId", "معرّف فيديو YouTube", "media"),
    field(
      "heroVideoLocales",
      "لغات عرض الفيديو (فارغ = جميع اللغات)",
      "media",
      "ids",
    ),
    field("ctaPrimaryHref", "وجهة الزر الأول", "content", "url"),
    field("ctaSecondaryHref", "وجهة الزر الثاني", "content", "url"),
    field("ctaTertiaryHref", "وجهة الزر الثالث", "content", "url"),
    field("isActive", "نشر الصفحة", "review", "boolean"),
    field("order", "الترتيب", "review", "number"),
  ],
  "urgent-banners": [
    field("ctaUrl", "وجهة الزر الرئيسي", "links", "url"),
    field("ctaSecondaryUrl", "وجهة الزر الثاني", "links", "url"),
    field("campaignId", "المشروع المرتبط عند غياب وجهة يدوية", "links", "ids"),
    field("image", "صورة البانر", "media", "image"),
    field("tone", "اللون", "media", "select", [
      ["red", "أحمر"],
      ["navy", "كحلي"],
      ["gold", "ذهبي"],
      ["green", "أخضر"],
    ]),
    field("textSide", "موضع النص", "media", "select", [
      ["start", "بداية الصورة"],
      ["end", "نهاية الصورة"],
    ]),
    field("suggestedAmounts", "المبالغ المقترحة بالدولار", "media", "numbers"),
    field("placements", "الصفحات ومواضع العرض", "display", "ids"),
    field("locales", "لغات الظهور (فارغ = جميع اللغات)", "display", "ids"),
    field("startsAt", "بداية الظهور · إسطنبول", "display", "date"),
    field("endsAt", "نهاية الظهور · إسطنبول", "display", "date"),
    field("priority", "ترتيب البانر", "display", "number"),
    field("isActive", "البانر مفعّل", "review", "boolean"),
  ],
};
export function settingsFor(
  kind: ContentKind,
  row: ContentRecord,
): ContentRecord {
  const result = Object.fromEntries(
    settingsFields(kind, row).map((f) => [
      f.key,
      row[f.key] ??
        (f.type === "boolean"
          ? f.key === "navigationVisible"
          : ["images", "numbers"].includes(f.type) ||
              [
                "categoryIds",
                "campaignIds",
                "heroVideoLocales",
                "locales",
                "placements",
                "achievementVideoIds",
              ].includes(f.key)
            ? []
            : f.type === "number"
              ? 0
              : ""),
    ]),
  );
  if (kind === "campaigns") {
    result.defaultDonationAmounts = parseSuggestedDonations(
      row.suggestedDonations,
    ).amounts;
    result.defaultShareCounts = parseSuggestedShareCounts(
      row.suggestedShareCounts,
    ).counts;
  }
  if (kind === "super-categories") {
    result.blocks = Array.isArray(row.blocks)
      ? row.blocks.map((b) =>
          Object.fromEntries(
            [
              "id",
              "kind",
              "anchor",
              "linkUrl",
              "image",
              "youtubeId",
              "refId",
              "maxItems",
              "isActive",
              "order",
            ].map((k) => [
              k,
              b[k] ?? (k === "isActive" ? true : k === "maxItems" ? null : ""),
            ]),
          ),
        )
      : [];
    result.items = Array.isArray(row.items)
      ? row.items.map((i) => ({ kind: i.kind, refId: i.refId, order: i.order }))
      : [];
  }
  return result;
}
const CATEGORY_PAGE_SETTINGS: SettingField[] = [
  field("heroImage", "صورة واجهة صفحة التصنيف", "page", "image"),
  field("heroVideoUrl", "فيديو الواجهة (رابط YouTube أو معرّف)", "page"),
  field("statDoneValue", "عدد الإنجازات", "page", "number"),
  field("statGoalValue", "العدد المستهدف", "page", "number"),
  field(
    "donateToCategory",
    "صندوق التبرع يستقبل للتصنيف نفسه",
    "page",
    "boolean",
  ),
  field(
    "donateCampaignId",
    "مشروع صندوق التبرع (عند عدم التبرع للتصنيف)",
    "page",
    "ids",
  ),
  field(
    "suggestedAmounts",
    "المبالغ المقترحة لصندوق التصنيف",
    "page",
    "numbers",
  ),
  field("achievementVideoIds", "فيديوهات الإنجازات المرتبطة", "page", "ids"),
];
export function settingsFields(
  kind: ContentKind,
  row: ContentRecord,
): SettingField[] {
  return [
    ...SETTING_FIELDS[kind],
    ...(kind === "categories"
      ? CATEGORY_PAGE_SETTINGS.filter((f) => f.key in row)
      : []),
  ];
}
export const ADVANCED_SEO_FIELDS = [
  { key: "seoKeyword", label: "العبارة الرئيسية المستهدفة" },
  { key: "ogTitle", label: "عنوان المشاركة" },
  { key: "ogDescription", label: "وصف المشاركة" },
  { key: "ogImage", label: "صورة المشاركة" },
  { key: "seoNoIndex", label: "منع الفهرسة" },
  { key: "faqContent", label: "الأسئلة الشائعة" },
] as const;
