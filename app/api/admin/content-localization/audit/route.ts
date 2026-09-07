import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  contentLocalizationPermissionForSection,
  parseContentLocalizationSection,
  type ContentLocalizationSection,
} from "@/lib/content-localization/access";
import { prisma } from "@/lib/prisma";

const TARGET_LOCALES = ["en", "fr", "tr", "id", "pt", "es", "de"] as const;
type Locale = (typeof TARGET_LOCALES)[number];

type TranslationStatus = {
  exists: boolean;
  complete: boolean;
  missingFields: string[];
  emptyFields: string[];
  identicalToArabicFields: string[];
};

type AuditItem = {
  id: string;
  label: string;
  section: ContentLocalizationSection | "blog_categories" | "blog_posts";
  typeLabel: string;
  arabicQualityIssues: { field: string; rule: string; suggestion: string }[];
  localeStatus: Record<Locale, TranslationStatus>;
};

function extractRichText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractRichText).filter(Boolean).join(" ");
  if (typeof node !== "object") return "";
  const value = node as { text?: unknown; content?: unknown };
  const ownText = typeof value.text === "string" ? value.text : "";
  const childText = Array.isArray(value.content) ? extractRichText(value.content) : "";
  return [ownText, childText].filter(Boolean).join(" ");
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("{")) {
    try {
      return extractRichText(JSON.parse(raw)).replace(/\s+/g, " ").trim();
    } catch {
      // Continue with HTML/plain text cleanup.
    }
  }
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function arabicQualityIssues(fields: Record<string, unknown>) {
  const rules = [
    { rule: "english_leak", pattern: /\b(Project|Campaign|Donate|Donation|Payment|Receipt|Share|Shares|Blog|News|Category)\b/i, suggestion: "توجد كلمات إنجليزية داخل النص العربي." },
    { rule: "typo_shares", pattern: /سهوم/g, suggestion: "راجع كلمة الأسهم في النص العربي." },
    { rule: "gender_project", pattern: /المشروع\s+التي|مشروع\s+التي/g, suggestion: "راجع توافق التذكير والتأنيث مع كلمة مشروع." },
    { rule: "hamza_latest", pattern: /(^|\s)اخر(\s|$)/g, suggestion: "يفضل استخدام: آخر." },
  ];
  const issues: { field: string; rule: string; suggestion: string }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const body = normalizeText(value);
    if (!body) continue;
    for (const item of rules) {
      item.pattern.lastIndex = 0;
      if (item.pattern.test(body)) issues.push({ field, rule: item.rule, suggestion: item.suggestion });
    }
  }
  return issues;
}

function evaluateItem(input: {
  id: string;
  label: string;
  section: AuditItem["section"];
  typeLabel: string;
  arabicFields: Record<string, unknown>;
  translations: Array<Record<string, unknown> & { locale?: string }>;
  fields: string[];
}): AuditItem {
  const translationMap = new Map(
    (input.translations || []).filter((row) => row.locale).map((row) => [row.locale as string, row]),
  );
  const localeStatus = {} as Record<Locale, TranslationStatus>;

  for (const locale of TARGET_LOCALES) {
    const row = translationMap.get(locale);
    const missingFields: string[] = [];
    const emptyFields: string[] = [];
    const identicalToArabicFields: string[] = [];
    for (const field of input.fields) {
      if (!row || !(field in row)) {
        missingFields.push(field);
        continue;
      }
      const translated = normalizeText(row[field]);
      const arabic = normalizeText(input.arabicFields[field]);
      if (!translated) emptyFields.push(field);
      if (arabic && translated && arabic === translated) identicalToArabicFields.push(field);
    }
    localeStatus[locale] = {
      exists: Boolean(row),
      complete: missingFields.length === 0 && emptyFields.length === 0 && identicalToArabicFields.length === 0,
      missingFields,
      emptyFields,
      identicalToArabicFields,
    };
  }

  return {
    id: input.id,
    label: input.label,
    section: input.section,
    typeLabel: input.typeLabel,
    arabicQualityIssues: arabicQualityIssues(input.arabicFields),
    localeStatus,
  };
}

function summarize(items: AuditItem[]) {
  const byLocale = Object.fromEntries(
    TARGET_LOCALES.map((locale) => [
      locale,
      { incompleteItems: 0, missingRecords: 0, emptyFields: 0, identicalToArabicFields: 0 },
    ]),
  ) as Record<Locale, { incompleteItems: number; missingRecords: number; emptyFields: number; identicalToArabicFields: number }>;
  let arabicIssues = 0;
  for (const item of items) {
    arabicIssues += item.arabicQualityIssues.length;
    for (const locale of TARGET_LOCALES) {
      const status = item.localeStatus[locale];
      if (!status.complete) byLocale[locale].incompleteItems += 1;
      if (!status.exists) byLocale[locale].missingRecords += 1;
      byLocale[locale].emptyFields += status.emptyFields.length;
      byLocale[locale].identicalToArabicFields += status.identicalToArabicFields.length;
    }
  }
  return { totalItems: items.length, arabicQualityIssues: arabicIssues, byLocale };
}

async function loadItems(section: ContentLocalizationSection): Promise<AuditItem[]> {
  if (section === "campaigns") {
    const rows = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { translations: true } });
    return rows.map((item) => evaluateItem({
      id: item.id,
      label: item.title,
      section,
      typeLabel: "مشروع",
      arabicFields: { title: item.title, description: item.description },
      translations: item.translations,
      fields: ["title", "description"],
    }));
  }
  if (section === "slides") {
    const rows = await prisma.slide.findMany({ orderBy: { order: "asc" }, include: { translations: true } });
    return rows.map((item) => evaluateItem({
      id: item.id,
      label: item.title || "بدون عنوان",
      section,
      typeLabel: "شريحة",
      arabicFields: { title: item.title, description: item.description, buttonText: item.buttonText },
      translations: item.translations,
      fields: ["title", "description", "buttonText"],
    }));
  }
  if (section === "categories") {
    const rows = await prisma.category.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], include: { translations: true } });
    return rows.map((item) => evaluateItem({
      id: item.id,
      label: item.name,
      section,
      typeLabel: "حملة / تصنيف",
      arabicFields: { name: item.name, description: item.description },
      translations: item.translations,
      fields: ["name", "description"],
    }));
  }
  const [posts, postCategories] = await Promise.all([
    prisma.post.findMany({ orderBy: { createdAt: "desc" }, include: { translations: true } }),
    prisma.postCategory.findMany({ orderBy: { createdAt: "desc" }, include: { translations: true } }),
  ]);
  return [
    ...posts.map((item) => evaluateItem({
      id: item.id,
      label: item.title || "بدون عنوان",
      section: "blog_posts",
      typeLabel: "مقال",
      arabicFields: { title: item.title, description: item.description, content: item.content },
      translations: item.translations,
      fields: ["title", "description", "content"],
    })),
    ...postCategories.map((item) => evaluateItem({
      id: item.id,
      label: item.name,
      section: "blog_categories",
      typeLabel: "تصنيف مدونة",
      arabicFields: { name: item.name, title: item.title, description: item.description },
      translations: item.translations,
      fields: ["name", "title", "description"],
    })),
  ];
}

export async function GET(request: NextRequest) {
  try {
    const section = parseContentLocalizationSection(
      request.nextUrl.searchParams.get("section"),
    );
    if (!section) return NextResponse.json({ error: "Invalid section" }, { status: 400 });

    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(
      session,
      contentLocalizationPermissionForSection(section),
    );
    if (denied) return denied;

    const items = await loadItems(section);
    const onlyIssues = request.nextUrl.searchParams.get("onlyIssues") !== "false";
    const visibleItems = onlyIssues
      ? items.filter((item) => item.arabicQualityIssues.length > 0 || TARGET_LOCALES.some((locale) => !item.localeStatus[locale].complete))
      : items;

    return NextResponse.json({
      ok: true,
      section,
      targetLocales: TARGET_LOCALES,
      generatedAt: new Date().toISOString(),
      summary: summarize(items),
      items: visibleItems.slice(0, 200),
    });
  } catch (error) {
    console.error("Content localization audit failed:", error);
    return NextResponse.json({ error: "Failed to audit content localization" }, { status: 500 });
  }
}
