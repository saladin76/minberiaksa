import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

type SeoContentType = "campaign" | "category" | "blog";

type FaqItem = { question: string; answer: string };

function parseType(value: unknown): SeoContentType | null {
  return value === "campaign" || value === "category" || value === "blog" ? value : null;
}

function permissionForType(type: SeoContentType) {
  if (type === "campaign") return "campaigns" as const;
  if (type === "category") return "categories" as const;
  return "blog" as const;
}

function cleanString(value: unknown, max = 5000) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMultiline(value: unknown, max = 5000) {
  if (typeof value !== "string") return "";
  return value.replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

function cleanArray(value: unknown, maxItems = 8, maxLen = 100) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item, maxLen)).filter(Boolean).slice(0, maxItems);
}

function cleanFaq(value: unknown, maxItems = 4): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      question: cleanString((item as any)?.question, 160),
      answer: cleanString((item as any)?.answer, 260),
    }))
    .filter((item) => item.question && item.answer)
    .slice(0, maxItems);
}

function stripCodeFence(value: string) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function extractKeywords(title: string, text: string) {
  const stop = new Set(["في", "من", "على", "إلى", "الى", "عن", "مع", "هذا", "هذه", "التي", "الذي", "the", "and", "for", "with", "from", "about", "this", "that", "your", "you", "our"]);
  const words = `${title} ${title} ${text}`
    .replace(/[،؛؟!.,:()\[\]{}"'\\/]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !stop.has(w.toLowerCase()));
  const map = new Map<string, number>();
  for (const w of words) map.set(w, (map.get(w) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
}

function fallbackFaq(type: SeoContentType, isArabic: boolean, primary: string, title: string): FaqItem[] {
  const subject = primary || title || (isArabic ? "هذا المشروع" : "this project");
  if (isArabic) {
    if (type === "blog") {
      return [
        { question: `ما أهمية ${subject}؟`, answer: "يساعد هذا المحتوى القارئ على فهم الموضوع وأثره الإنساني بطريقة واضحة ومباشرة." },
        { question: "كيف يمكن دعم المبادرات الإنسانية؟", answer: "يمكن دعم المبادرات عبر التبرع الآمن أو مشاركة المحتوى مع المهتمين." },
        { question: "لماذا تُعد الشفافية مهمة؟", answer: "الشفافية تساعد المتبرع على فهم أثر مساهمته وكيف تصل المساعدة إلى المستفيدين." },
      ];
    }
    return [
      { question: `ما هو ${subject}؟`, answer: "مبادرة إنسانية تهدف إلى دعم المحتاجين وتوفير احتياج واضح بطريقة منظمة وموثوقة." },
      { question: `كيف أساهم في ${subject}؟`, answer: "يمكنك اختيار قيمة التبرع المناسبة وإتمام المساهمة بأمان من خلال الموقع." },
      { question: "من المستفيد من التبرع؟", answer: "تُوجّه التبرعات إلى المستحقين حسب طبيعة المشروع والمنطقة المستهدفة." },
    ];
  }

  if (type === "blog") {
    return [
      { question: `Why is ${subject} important?`, answer: "It helps readers understand the issue and its humanitarian impact clearly." },
      { question: "How can humanitarian initiatives be supported?", answer: "They can be supported through secure donations or by sharing the content with interested people." },
      { question: "Why is transparency important?", answer: "Transparency helps donors understand the impact of their contribution." },
    ];
  }
  return [
    { question: `What is ${subject}?`, answer: "A humanitarian initiative designed to support people in need in an organized and trustworthy way." },
    { question: `How can I support ${subject}?`, answer: "Choose a suitable donation amount and complete your contribution securely through the website." },
    { question: "Who benefits from the donation?", answer: "Donations are directed to eligible beneficiaries according to the project type and target region." },
  ];
}

function fallbackImprove(type: SeoContentType, locale: string, title: string, text: string, incomingKeywords: string[]) {
  const isArabic = locale === "ar" || /[\u0600-\u06FF]/.test(text + title);
  const clean = text.trim();
  const safeTitle = title.trim();
  const keywords = incomingKeywords.length ? incomingKeywords : extractKeywords(safeTitle, clean);
  const primaryKeyword = keywords[0] || safeTitle.split(/\s+/).slice(0, 3).join(" ");

  const h2 = isArabic
    ? type === "blog" ? `لماذا ${primaryKeyword || safeTitle || "هذا الموضوع"} مهم؟` : `أهمية ${primaryKeyword || safeTitle || "هذا المشروع"}`
    : type === "blog" ? `Why ${primaryKeyword || safeTitle || "this topic"} matters` : `The impact of ${primaryKeyword || safeTitle || "this project"}`;

  const cta = isArabic
    ? type === "blog"
      ? "يساعد هذا المحتوى القارئ على فهم الأثر الإنساني وطرق المساهمة بوعي وثقة."
      : "ساهم الآن في دعم هذا المشروع، وكن سببًا في وصول العون إلى مستحقيه بطريقة آمنة وموثوقة."
    : type === "blog"
      ? "This content helps readers understand the humanitarian impact and practical ways to contribute with confidence."
      : "Support this project through a secure donation and help deliver meaningful aid to those who need it most.";

  const intro = safeTitle && !clean.toLowerCase().includes(safeTitle.toLowerCase())
    ? isArabic ? `يهدف ${safeTitle} إلى تقديم دعم إنساني منظم للمحتاجين.` : `${safeTitle} is designed to provide organized humanitarian support for people in need.`
    : "";

  const improvedText = [`## ${h2}`, intro, clean, `### ${isArabic ? "دعوة للمساهمة" : "How to help"}`, cta].filter(Boolean).join("\n\n").slice(0, 3500);

  return {
    improvedTitle: safeTitle,
    improvedText,
    metaDescription: clean ? clean.slice(0, 155) : cta.slice(0, 155),
    primaryKeyword,
    secondaryKeywords: keywords.filter((kw) => kw !== primaryKeyword).slice(0, 6),
    suggestedHeadings: [h2, isArabic ? "الأثر المتوقع" : "Expected impact", isArabic ? "كيف تساهم؟" : "How to contribute"],
    suggestedSlug: primaryKeyword ? primaryKeyword.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-\u0600-\u06FF]/gi, "") : "",
    faq: fallbackFaq(type, isArabic, primaryKeyword, safeTitle),
    notes: isArabic
      ? ["تم ترتيب النص بعناوين واضحة وإضافة كلمة رئيسية وأسئلة شائعة مقترحة دون اختلاق معلومات جديدة."]
      : ["Structured the text with clearer headings, a primary keyword, and FAQ suggestions without inventing new facts."],
    keywords,
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

    const title = cleanString(body?.title, 220);
    const text = cleanMultiline(body?.text, 4500);
    const locale = cleanString(body?.locale, 20) || "ar";
    const keywords = cleanArray(body?.keywords, 12, 80);

    if (!text && !title) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: true, source: "fallback", ...fallbackImprove(type, locale, title, text, keywords) });
    }

    const prompt = [
      "You are a senior SEO copy editor for a humanitarian donation website.",
      "Turn the provided visible text into a professional SEO-ready content draft.",
      "Do not mention AI, models, automation, SEO score, or internal tools.",
      "Preserve all factual meaning. Do not invent numbers, locations, dates, guarantees, medical claims, religious quotes, or promises.",
      "Keep the same language as the locale/content. Make it sound human, warm, and natural.",
      "Structure the text with clear H2/H3-style markdown headings when useful. Do not over-format.",
      "Create practical FAQ questions and answers that match the exact content and search intent.",
      "For donation projects/campaigns: include a careful, warm call to action and focus on beneficiary, impact, trust, and donation intent.",
      "For articles: improve readability, search intent, heading hierarchy, introduction, body flow, conclusion, and FAQ intent.",
      "Return strict JSON only with this shape:",
      "{\"improvedTitle\":\"\",\"improvedText\":\"\",\"metaDescription\":\"\",\"primaryKeyword\":\"\",\"secondaryKeywords\":[\"\"],\"suggestedHeadings\":[\"\"],\"suggestedSlug\":\"\",\"faq\":[{\"question\":\"\",\"answer\":\"\"}],\"notes\":[\"\"],\"keywords\":[\"\"]}",
      "Rules for fields:",
      "- improvedTitle: concise human title, not clickbait.",
      "- improvedText: formatted body text with headings, short paragraphs, and a natural CTA when appropriate.",
      "- metaDescription: 130-160 characters when possible.",
      "- primaryKeyword: one clear search phrase from the content.",
      "- secondaryKeywords: 4-8 useful related keywords.",
      "- suggestedHeadings: 3-6 headings suitable for the body.",
      "- faq: 3-4 concise FAQ items; answers must be factual, useful, and not exaggerated.",
      "- suggestedSlug: short lowercase SEO slug when language supports it; otherwise a clean readable phrase.",
      `Type: ${type}`,
      `Locale: ${locale}`,
      `Title: ${title}`,
      `Current keywords: ${JSON.stringify(keywords)}`,
      `Text: ${text}`,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.CONTENT_LOCALIZATION_MODEL || "gpt-4o-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return valid JSON only. Preserve facts and write naturally for SEO." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return NextResponse.json({ error: `Text improvement failed: ${response.status} ${details.slice(0, 300)}` }, { status: response.status });
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return NextResponse.json({ error: "Text improvement returned no content" }, { status: 500 });
    }

    const parsed = JSON.parse(stripCodeFence(raw));
    const improvedText = cleanMultiline(parsed?.improvedText, 4000);
    if (!improvedText) return NextResponse.json({ error: "Text improvement returned empty text" }, { status: 500 });

    const mergedKeywords = cleanArray(parsed?.keywords, 10, 80);
    const secondaryKeywords = cleanArray(parsed?.secondaryKeywords, 8, 80);
    const primaryKeyword = cleanString(parsed?.primaryKeyword, 100);

    return NextResponse.json({
      ok: true,
      source: "openai",
      improvedTitle: cleanString(parsed?.improvedTitle, 120) || title,
      improvedText,
      metaDescription: cleanString(parsed?.metaDescription, 180),
      primaryKeyword,
      secondaryKeywords,
      suggestedHeadings: cleanArray(parsed?.suggestedHeadings, 6, 120),
      suggestedSlug: cleanString(parsed?.suggestedSlug, 120),
      faq: cleanFaq(parsed?.faq, 4),
      notes: cleanArray(parsed?.notes, 6, 180),
      keywords: mergedKeywords.length ? mergedKeywords : [primaryKeyword, ...secondaryKeywords].filter(Boolean),
    });
  } catch (error) {
    console.error("SEO text improvement failed:", error);
    return NextResponse.json({ error: "Failed to improve text" }, { status: 500 });
  }
}
