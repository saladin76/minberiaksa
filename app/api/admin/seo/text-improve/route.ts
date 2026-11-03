import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { isValidLocale } from "@/lib/locales";
import { translateItem } from "@/lib/content-localization/translate";
import { generateResearchedSeo, SeoResearchError } from "@/lib/content-editor/seo-research";
import { suggestionFailure } from "@/lib/ai/core/suggestion-failure";

export const maxDuration = 300;

/** Legacy form adapter: use the same Arabic-master and formatting gates as the editor. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!["campaign", "category", "blog"].includes(body?.type))
      return NextResponse.json({ error: "Invalid SEO content type" }, { status: 400 });
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, body.type === "campaign" ? "campaigns" : body.type === "category" ? "categories" : "blog");
    if (denied) return denied;
    const locale = body.locale || "ar";
    if (!isValidLocale(locale)) return NextResponse.json({ error: "لغة غير صالحة" }, { status: 400 });
    const source = body.sourceDraft ?? (locale === "ar" ? body : null);
    if (!source || typeof source.title !== "string" || typeof source.text !== "string" || !(source.title.trim() || source.text.trim()))
      return NextResponse.json({ error: "اكتب المحتوى بالعربية أولًا واستخدمه مرجعًا للترجمة وتحسين النص." }, { status: 400 });
    if (source.title.length > 220 || source.text.length > 12000)
      return NextResponse.json({ error: "النص أطول من حد الطلب. قسّمه إلى أجزاء قبل المعالجة." }, { status: 400 });
    const copy = await translateItem({
      fields: { title: source.title, text: source.text }, sourceLocale: "ar",
      ...(locale === "ar" ? { mode: "proofread" as const } : {}), signal: request.signal,
    }, locale);
    if (source.title.trim() && !copy.fields.title || source.text.trim() && !copy.fields.text)
      return NextResponse.json({ error: "لم يجتز النص فحص المعنى والقيم المحمية والبنية. لم يتغير المحتوى.", warnings: copy.warnings }, { status: 422 });
    const seo = await generateResearchedSeo({ type: body.type, locale, title: source.title, description: source.text,
      keywords: Array.isArray(source.keywords) ? source.keywords : [] }, request.signal);
    return NextResponse.json({ ok: true, source: "openai",
      improvedTitle: copy.fields.title || "", improvedText: copy.fields.text || "",
      metaDescription: seo.suggestion.metaDescription, primaryKeyword: seo.suggestion.primaryKeyword,
      secondaryKeywords: seo.suggestion.longTailKeywords, keywords: seo.suggestion.keywords,
      suggestedHeadings: [], suggestedSlug: "", faq: seo.suggestion.faq,
      notes: [...copy.warnings, ...seo.suggestion.notes], research: seo.research,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = suggestionFailure(error);
    if (failure) return NextResponse.json({ error: failure.error, reason: failure.reason, stopBatch: failure.stopBatch }, { status: failure.status });
    return NextResponse.json({ error: error instanceof SeoResearchError ? error.message : "تعذر تحسين النص. لم يتغير المحتوى." }, { status: error instanceof SeoResearchError ? error.status : 500 });
  }
}
