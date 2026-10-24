import { isValidLocale } from "@/lib/locales";
import { LOCALE_ENGLISH_NAMES } from "@/lib/content-localization/translate";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

type SeoContentType = "campaign" | "category" | "blog";

type SeoSuggestion = {
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  keywords: string[];
  longTailKeywords: string[];
  altText: string;
  faq: { question: string; answer: string }[];
  schemaType: string;
  notes: string[];
};

function parseType(value: unknown): SeoContentType | null {
  return value === "campaign" || value === "category" || value === "blog" ? value : null;
}

function permissionForType(type: SeoContentType) {
  if (type === "campaign") return "campaigns" as const;
  if (type === "category") return "categories" as const;
  return "blog" as const;
}

function stripCodeFence(value: string) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function cleanString(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanArray(value: unknown, maxItems = 8, maxLen = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function seoTitleMax(locale: string) {
  return locale === "ja" || locale === "zh" ? 42 : 70;
}

function metaDescriptionMax(locale: string) {
  return locale === "ja" || locale === "zh" ? 90 : 160;
}

const SCHEMA_BY_TYPE: Record<SeoContentType, string> = {
  campaign: "DonateAction + BreadcrumbList + FAQPage",
  category: "CollectionPage + BreadcrumbList",
  blog: "Article + BreadcrumbList + FAQPage",
};

function sanitizeSuggestion(raw: unknown, fallbackTitle: string, type: SeoContentType, locale: string): SeoSuggestion {
  const suggestion = asRecord(raw);
  const faqSource = Array.isArray(suggestion.faq) ? suggestion.faq : [];
  const faq = faqSource
    .map((item) => {
      const row = asRecord(item);
      return { question: cleanString(row.question, 120), answer: cleanString(row.answer, 260) };
    })
    .filter((item: { question: string; answer: string }) => item.question && item.answer)
    .slice(0, 5);

  return {
    seoTitle: cleanString(suggestion.seoTitle, seoTitleMax(locale)) || cleanString(fallbackTitle, seoTitleMax(locale)),
    metaDescription: cleanString(suggestion.metaDescription, metaDescriptionMax(locale)),
    primaryKeyword: cleanString(suggestion.primaryKeyword, 80),
    keywords: cleanArray(suggestion.keywords, 10, 60),
    longTailKeywords: cleanArray(suggestion.longTailKeywords, 8, 100),
    altText: cleanString(suggestion.altText, 140),
    faq,
    schemaType: SCHEMA_BY_TYPE[type],
    notes: cleanArray(suggestion.notes, 5, 160),
  };
}

function responseOutputText(payload: unknown): { text: string; annotations: unknown[] } {
  const output = asRecord(payload).output;
  const messages = Array.isArray(output) ? output.filter((item) => asRecord(item).type === "message") : [];
  for (const rawMessage of messages) {
    const message = asRecord(rawMessage);
    const blocks = Array.isArray(message.content) ? message.content : [];
    for (const rawBlock of blocks) {
      const block = asRecord(rawBlock);
      if (block.type === "output_text" && typeof block.text === "string") {
        return { text: block.text, annotations: Array.isArray(block.annotations) ? block.annotations : [] };
      }
    }
  }
  return { text: "", annotations: [] };
}

function webSources(payload: unknown, annotations: unknown[]) {
  const byUrl = new Map<string, { title: string; url: string }>();
  const output = asRecord(payload).output;
  for (const rawItem of Array.isArray(output) ? output : []) {
    const item = asRecord(rawItem);
    if (item.type !== "web_search_call") continue;
    const sources = asRecord(item.action).sources;
    for (const rawSource of Array.isArray(sources) ? sources : []) {
      const source = asRecord(rawSource);
      if (typeof source.url === "string") byUrl.set(source.url, { url: source.url, title: cleanString(source.title, 180) || source.url });
    }
  }
  for (const rawAnnotation of annotations) {
    const citation = asRecord(asRecord(rawAnnotation).url_citation);
    if (typeof citation.url === "string") byUrl.set(citation.url, { url: citation.url, title: cleanString(citation.title, 180) || citation.url });
  }
  return [...byUrl.values()].filter((source) => /^https?:\/\//i.test(source.url)).slice(0, 12);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = parseType(body?.type);
    if (!type) return NextResponse.json({ error: "Invalid SEO content type" }, { status: 400 });

    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, permissionForType(type));
    if (denied) return denied;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 412 });
    }

    const title = cleanString(body?.title, 220);
    const description = cleanString(body?.description, 3500);
    const requestedLocale = cleanString(body?.locale, 20) || "ar";
    const locale = isValidLocale(requestedLocale) ? requestedLocale : "ar";
    const languageName = LOCALE_ENGLISH_NAMES[locale] ?? locale;
    const currentKeywords = cleanArray(body?.keywords, 8, 60);
    const market = cleanString(body?.market, 120) || "not specified; do not assume a country";

    const prompt = [
      "You are a senior SEO strategist and humanitarian fundraising copywriter.",
      "Research the web first, then create professional SEO suggestions for a nonprofit donation website.",
      "Use natural human wording. Do not mention AI, models, generation, or automation.",
      `Write every suggested human-facing field in ${languageName}. Do not return English copy unless the target language is English or a proper noun genuinely requires it.`,
      `Use the requested language and market context (${market}); do not infer a country if the market was not specified. Localize search intent; do not translate keywords word-for-word.`,
      "Use web research to discover relevant terminology, user questions, and trustworthy context. Return a concise researchSummary, evidence-backed searchQueries, and questionsOnlyWhenSupported.",
      "Keep the visible site name/title separate from SEO title. Do not ask to rename the visible category/project/article unless necessary.",
      "Preserve facts. Do not invent countries, numbers, guarantees, dates, medical claims, religious quotes, or promises.",
      "Return strict JSON only with this shape:",
      "{\"seoTitle\":\"\",\"metaDescription\":\"\",\"primaryKeyword\":\"\",\"keywords\":[\"\"],\"longTailKeywords\":[\"\"],\"altText\":\"\",\"faq\":[{\"question\":\"\",\"answer\":\"\"}],\"schemaType\":\"\",\"notes\":[\"\"],\"researchSummary\":\"\",\"searchQueries\":[\"\"]}",
      "SEO title should usually be 45-70 characters. Meta description should usually be 130-160 characters.",
      "FAQ answers must be short and careful. Only create FAQ claims directly supported by the supplied content; otherwise omit the FAQ item.",
      "Do not invent impact numbers, beneficiary counts, tax status, urgency, religious rulings, guarantees, delivery dates or locations.",
      `Target SEO-title maximum: ${seoTitleMax(locale)} characters. Target meta-description maximum: ${metaDescriptionMax(locale)} characters.`,
      `Content type: ${type}`,
      `Locale: ${locale}`,
      `Visible title/name: ${title}`,
      `Description/content: ${description}`,
      `Current extracted keywords: ${JSON.stringify(currentKeywords)}`,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.SEO_RESEARCH_MODEL || "gpt-5.5",
        tools: [{ type: "web_search", search_context_size: "medium" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        text: { format: { type: "json_object" } },
        input: [
          { role: "system", content: "Return valid JSON only. Search the web before answering. Be precise, cautious, and natural. Never fabricate facts or search metrics." },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(75_000),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return NextResponse.json({ error: `SEO suggestions failed: ${response.status} ${details.slice(0, 300)}` }, { status: response.status });
    }

    const payload: unknown = await response.json();
    const { text, annotations } = responseOutputText(payload);
    const output = asRecord(payload).output;
    const performedSearch = Array.isArray(output) && output.some((item) => {
      const row = asRecord(item);
      return row.type === "web_search_call" && row.status === "completed";
    });
    if (!performedSearch) {
      return NextResponse.json({ error: "SEO research could not confirm that a web search ran; no unresearched suggestion was created." }, { status: 502 });
    }
    if (!text) {
      return NextResponse.json({ error: "SEO suggestions returned no content" }, { status: 500 });
    }

    const parsed = JSON.parse(stripCodeFence(text));
    const suggestion = sanitizeSuggestion(parsed, title, type, locale);
    return NextResponse.json({
      ok: true,
      suggestion,
      research: {
        summary: cleanString(parsed?.researchSummary, 1200),
        queries: cleanArray(parsed?.searchQueries, 8, 160),
        sources: webSources(payload, annotations),
        market,
        locale,
        accessedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("SEO suggestions failed:", error);
    return NextResponse.json({ error: "Failed to generate SEO suggestions" }, { status: 500 });
  }
}
