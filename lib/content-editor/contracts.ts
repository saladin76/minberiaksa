import { SUPPORTED_LOCALES } from "../locales";
import type { DashboardPermissionKey } from "../dashboard/permissions";

export const CONTENT_KINDS = [
  "campaigns",
  "categories",
  "blog",
  "super-categories",
  "urgent-banners",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type TextValues = Record<string, string>;
export type ContentField = {
  key: string;
  label: string;
  group: "content" | "seo";
  rich?: boolean;
  locked?: boolean;
  required?: boolean;
};
export type ContentRecord = Record<string, unknown>;
export const CONFIG: Record<
  ContentKind,
  {
    label: string;
    model: string;
    translationModel: string;
    parentKey: string;
    permission: DashboardPermissionKey;
    fields: ContentField[];
  }
> = {
  campaigns: {
    label: "المشاريع",
    model: "campaign",
    translationModel: "campaignTranslation",
    parentKey: "campaignId",
    permission: "campaigns",
    fields: [
      { key: "title", label: "العنوان", group: "content", required: true },
      {
        key: "description",
        label: "المحتوى",
        group: "content",
        rich: true,
        required: true,
      },
    ],
  },
  categories: {
    label: "التصنيفات",
    model: "category",
    translationModel: "categoryTranslation",
    parentKey: "categoryId",
    permission: "categories",
    fields: [
      { key: "name", label: "اسم التصنيف", group: "content", required: true },
      ...[
        "description",
        "heroLead",
        "ctaLabel",
        "statDoneLabel",
        "statGoalLabel",
        "projectsTitle",
        "donateTitle",
        "donateNote",
        "achievementsTitle",
      ].map((key, i) => ({
        key,
        label: [
          "الوصف",
          "مقدمة الصفحة",
          "نص الزر",
          "عنوان المنجز",
          "عنوان الهدف",
          "عنوان المشاريع",
          "عنوان التبرع",
          "ملاحظة التبرع",
          "عنوان الإنجازات",
        ][i],
        group: "content" as const,
      })),
    ],
  },
  blog: {
    label: "المدونة",
    model: "post",
    translationModel: "postTranslation",
    parentKey: "postId",
    permission: "blog",
    fields: [
      { key: "title", label: "العنوان", group: "content", required: true },
      { key: "description", label: "الملخص", group: "content" },
      {
        key: "content",
        label: "المحتوى",
        group: "content",
        rich: true,
        required: true,
      },
    ],
  },
  "super-categories": {
    label: "الأقسام الكبرى",
    model: "superCategory",
    translationModel: "superCategoryTranslation",
    parentKey: "superCategoryId",
    permission: "siteContent",
    fields: [
      { key: "title", label: "عنوان القسم", group: "content", required: true },
      ...[
        "subtitle",
        "intro",
        "verseTranslation",
        "verseAttribution",
        "ctaPrimaryLabel",
        "ctaSecondaryLabel",
        "ctaTertiaryLabel",
      ].map((key, i) => ({
        key,
        label: [
          "العنوان الفرعي",
          "المقدمة",
          "ترجمة معنى الآية",
          "مصدر الترجمة",
          "الزر الأول",
          "الزر الثاني",
          "الزر الثالث",
        ][i],
        group: "content" as const,
        locked: key.startsWith("verse"),
      })),
    ],
  },
  "urgent-banners": {
    label: "البانرات",
    model: "urgentBanner",
    translationModel: "urgentBannerTranslation",
    parentKey: "urgentBannerId",
    permission: "siteContent",
    fields: [
      { key: "title", label: "العنوان", group: "content", required: true },
      { key: "kicker", label: "الشريط العلوي", group: "content", locked: true },
      { key: "description", label: "الوصف", group: "content" },
      { key: "ctaLabel", label: "الزر الرئيسي", group: "content" },
      { key: "ctaSecondaryLabel", label: "الزر الثانوي", group: "content" },
      {
        key: "amountLabels",
        label: "تسميات المبالغ (سطر لكل مبلغ)",
        group: "content",
      },
    ],
  },
};
export function parseKind(value: unknown): ContentKind | null {
  return typeof value === "string" &&
    (CONTENT_KINDS as readonly string[]).includes(value)
    ? (value as ContentKind)
    : null;
}
export function text(value: unknown): string {
  return Array.isArray(value)
    ? value.join("\n")
    : typeof value === "string"
      ? value
      : "";
}
function meaningfulDocument(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const value = node as { text?: unknown; content?: unknown[] };
  return (
    (typeof value.text === "string" &&
      Boolean(value.text.replace(/[\s\u200b]/g, ""))) ||
    (Array.isArray(value.content) && value.content.some(meaningfulDocument))
  );
}
export function hasText(value: unknown): boolean {
  const raw = text(value).trim();
  if (!raw) return false;
  if (raw.startsWith("{")) {
    try {
      const doc = JSON.parse(raw);
      if (doc.type === "doc") return meaningfulDocument(doc);
    } catch {
      /* ordinary text */
    }
  }
  return Boolean(raw.replace(/<[^>]*>|&nbsp;|[\s\u200b]/g, ""));
}
export function rows(value: unknown): ContentRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (v): v is ContentRecord => Boolean(v) && typeof v === "object",
      )
    : [];
}
export function fieldsFor(
  kind: ContentKind,
  row: ContentRecord,
): ContentField[] {
  const fields = [...CONFIG[kind].fields];
  if (kind !== "urgent-banners")
    fields.push(
      {
        key: kind === "campaigns" ? "seoTitle" : "metaTitle",
        label: "عنوان البحث",
        group: "seo",
      },
      {
        key: kind === "campaigns" ? "seoDescription" : "metaDescription",
        label: "وصف البحث",
        group: "seo",
      },
    );
  fields.push({
    key: "imageAlt",
    label: "وصف الصورة",
    group: "seo",
    required: Boolean(
      row.image ||
      row.heroImage ||
      (Array.isArray(row.images) && row.images.length),
    ),
  });
  const groups =
    kind === "categories"
      ? ([
          ["values", ["label"]],
          ["infoCards", ["title", "body"]],
        ] as const)
      : kind === "super-categories"
        ? ([
            ["blocks", ["eyebrow", "title", "subtitle", "body", "linkLabel"]],
          ] as const)
        : [];
  for (const [group, keys] of groups)
    for (const [index, child] of rows(row[group]).entries())
      for (const key of keys)
        fields.push({
          key: `${group}.${child.id}.${key}`,
          label: `${group === "blocks" ? "قسم" : group === "values" ? "قيمة" : "بطاقة"} ${index + 1} · ${key}`,
          group: "content",
        });
  return fields;
}
export function valuesFor(
  kind: ContentKind,
  row: ContentRecord,
  locale: string,
): TextValues {
  const own =
    locale === "ar"
      ? row
      : (rows(row.translations).find((t) => t.locale === locale) ?? {});
  return Object.fromEntries(
    fieldsFor(kind, row).map((field) => {
      const [group, id, key] = field.key.split(".");
      if (!id) return [field.key, text(own[field.key])];
      const child = rows(row[group]).find((c) => c.id === id) ?? {};
      const source =
        locale === "ar"
          ? child
          : (rows(child.translations).find((t) => t.locale === locale) ?? {});
      return [field.key, text(source[key])];
    }),
  );
}
export function localeStatus(
  fields: ContentField[],
  source: TextValues,
  value: TextValues,
  locale = "ar",
) {
  const required = fields.filter(
    (f) =>
      f.group === "content" &&
      (f.required ||
        (hasText(source[f.key]) && !(f.locked && f.key === "kicker"))),
  );
  const missing = required
    .filter(
      (f) =>
        !hasText(value[f.key]) ||
        (locale !== "ar" &&
          !f.locked &&
          /[\u0600-\u06ff]/.test(source[f.key] || "") &&
          value[f.key]?.trim() === source[f.key]?.trim()),
    )
    .map((f) => f.key);
  const seoFields = fields.filter(
    (f) => f.group === "seo" && (f.key !== "imageAlt" || f.required),
  );
  return {
    complete: required.length > 0 && !missing.length,
    missing,
    seoComplete: seoFields.every((f) => hasText(value[f.key])),
  };
}
export function statuses(kind: ContentKind, row: ContentRecord) {
  const fields = fieldsFor(kind, row),
    source = valuesFor(kind, row, "ar");
  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      localeStatus(fields, source, valuesFor(kind, row, locale), locale),
    ]),
  );
}
export function validateChanges(
  fields: ContentField[],
  value: unknown,
): TextValues {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("حقول غير صالحة");
  const allowed = new Set(fields.map((f) => f.key));
  const limit = (key: string) =>
    /(?:meta|seo)Title$/.test(key)
      ? 70
      : /(?:meta|seo)Description$/.test(key)
        ? 170
        : key === "imageAlt"
          ? 200
          : 200000;
  const entries = Object.entries(value);
  if (
    !entries.length ||
    entries.some(
      ([key, val]) =>
        !allowed.has(key) || typeof val !== "string" || val.length > limit(key),
    )
  )
    throw new Error("حقول غير صالحة");
  return Object.fromEntries(entries) as TextValues;
}
