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

function sanitizeSuggestion(raw: any, fallbackTitle: string, type: SeoContentType): SeoSuggestion {
  const faqSource = Array.isArray(raw?.faq) ? raw.faq : [];
  const faq = faqSource
    .map((item: any) => ({ question: cleanString(item?.question, 120), answer: cleanString(item?.answer, 260) }))
    .filter((item: { question: string; answer: string }) => item.question && item.answer)
    .slice(0, 5);

  return {
    seoTitle: cleanString(raw?.seoTitle, 80) || fallbackTitle,
    metaDescription: cleanString(raw?.metaDescription, 180),
    primaryKeyword: cleanString(raw?.primaryKeyword, 80),
    keywords: cleanArray(raw?.keywords, 10, 60),
    longTailKeywords: cleanArray(raw?.longTailKeywords, 8, 100),
    altText: cleanString(raw?.altText, 140),
    faq,
    schemaType: cleanString(raw?.schemaType, 60) || (type === "blog" ? "Article + FAQ" : type === "category" ? "CollectionPage + Breadcrumb" : "Fundraising Campaign + FAQ"),
    notes: cleanArray(raw?.notes, 5, 160),
  };
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
    const locale = cleanString(body?.locale, 20) || "ar";
    const currentKeywords = cleanArray(body?.keywords, 8, 60);

    const prompt = [
      "You are a senior SEO strategist and humanitarian fundraising copywriter.",
      "Create professional SEO suggestions for a nonprofit donation website.",
      "Use natural human wording. Do not mention AI, models, generation, or automation.",
      "Keep the visible site name/title separate from SEO title. Do not ask to rename the visible category/project/article unless necessary.",
      "Preserve facts. Do not invent countries, numbers, guarantees, dates, medical claims, religious quotes, or promises.",
      "Return strict JSON only with this shape:",
      "{\"seoTitle\":\"\",\"metaDescription\":\"\",\"primaryKeyword\":\"\",\"keywords\":[\"\"],\"longTailKeywords\":[\"\"],\"altText\":\"\",\"faq\":[{\"question\":\"\",\"answer\":\"\"}],\"schemaType\":\"\",\"notes\":[\"\"]}",
      "SEO title should usually be 45-70 characters. Meta description should usually be 130-160 characters.",
      "FAQ answers must be short and careful.",
      `Content type: ${type}`,
      `Locale: ${locale}`,
      `Visible title/name: ${title}`,
      `Description/content: ${description}`,
      `Current extracted keywords: ${JSON.stringify(currentKeywords)}`,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.CONTENT_LOCALIZATION_MODEL || "gpt-4o-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return valid JSON only. Be precise, cautious, and natural. Never fabricate facts." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return NextResponse.json({ error: `SEO suggestions failed: ${response.status} ${details.slice(0, 300)}` }, { status: response.status });
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return NextResponse.json({ error: "SEO suggestions returned no content" }, { status: 500 });
    }

    const parsed = JSON.parse(stripCodeFence(raw));
    const suggestion = sanitizeSuggestion(parsed, title, type);
    return NextResponse.json({ ok: true, suggestion });
  } catch (error) {
    console.error("SEO suggestions failed:", error);
    return NextResponse.json({ error: "Failed to generate SEO suggestions" }, { status: 500 });
  }
}
