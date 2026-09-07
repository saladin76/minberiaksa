import { prisma } from "@/lib/prisma";
import { jsonNoStore, requireArchiveApiAccess } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> | { id: string } };

type FileAnalysis = {
  summary: string;
  suggestedCategory: string;
  suggestedUse: string;
  keywords: string[];
  teamNotes: string[];
  confidence: "metadata_only" | "ai_assisted";
};

export async function POST(_request: Request, context: Params) {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const { id } = await Promise.resolve(context.params);
  const row = await prisma.auditLog.findUnique({ where: { id }, select: { id: true, action: true, entityType: true, metadata: true } });
  if (!row || row.action !== "archive.uploadedFile.create" || row.entityType !== "ArchiveUploadedFile") {
    return jsonNoStore({ ok: false, error: "الملف غير موجود" }, { status: 404 });
  }

  const metadata = metadataObject(row.metadata);
  const fallback = fallbackAnalysis(metadata);
  const apiKey = process.env.OPENAI_API_KEY;
  let analysis = fallback;

  if (apiKey) {
    try {
      analysis = await generateAiAnalysis(apiKey, metadata, fallback);
    } catch {
      analysis = fallback;
    }
  }

  await prisma.auditLog.update({
    where: { id },
    data: {
      metadata: {
        ...metadata,
        aiAnalysis: analysis,
        aiAnalyzedAt: new Date().toISOString(),
      },
      messageAr: "تم تحليل ملف أرشيفي",
      messageEn: "Archive uploaded file analyzed",
    },
  });

  return jsonNoStore({ ok: true, analysis, message: "تم تحليل الملف" });
}

async function generateAiAnalysis(apiKey: string, metadata: Record<string, unknown>, fallback: FileAnalysis): Promise<FileAnalysis> {
  const prompt = [
    "You are an operations and marketing archive assistant for a humanitarian nonprofit dashboard.",
    "Analyze the file metadata only. Do not claim that you read the actual file contents.",
    "Return Arabic JSON only. Be practical and concise.",
    "Do not invent numbers, dates, partners, or legal claims.",
    "Return strict JSON with this exact shape:",
    '{"summary":"","suggestedCategory":"","suggestedUse":"","keywords":[""],"teamNotes":[""],"confidence":"ai_assisted"}',
    `File name: ${stringField(metadata.fileName)}`,
    `Title: ${stringField(metadata.title)}`,
    `Notes: ${stringField(metadata.notes)}`,
    `Archive category: ${stringField(metadata.category)}`,
    `Current file category: ${stringField(metadata.fileCategory)}`,
    `Extension: ${stringField(metadata.extension)}`,
    `Fallback suggestion: ${JSON.stringify(fallback)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.CONTENT_LOCALIZATION_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return valid JSON only. Arabic output. Cautious metadata-only analysis." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error("AI request failed");
  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") throw new Error("AI response empty");
  return sanitizeAnalysis(JSON.parse(stripCodeFence(raw)), fallback);
}

function fallbackAnalysis(metadata: Record<string, unknown>): FileAnalysis {
  const category = stringField(metadata.category);
  const title = stringField(metadata.title) || stringField(metadata.fileName) || "ملف أرشيفي";
  const fileCategory = stringField(metadata.fileCategory) || (category === "MARKETING" ? "ملفات مشاريع" : "أوراق المؤسسة");
  const extension = stringField(metadata.extension).toUpperCase() || "FILE";
  const isMarketing = category === "MARKETING";

  return {
    summary: `هذا ملف ${extension} بعنوان "${title}" محفوظ ضمن ${isMarketing ? "ملفات المشاريع التسويقية" : "أرشفة المستندات"}. التحليل الحالي مبني على بيانات الملف فقط وليس على قراءة محتواه الداخلي.`,
    suggestedCategory: fileCategory,
    suggestedUse: isMarketing ? "استخدامه كمرجع لفريق التسويق عند تجهيز الحملات أو مراجعة نتائج المشاريع." : "استخدامه كمرجع إداري أو رسمي عند مراجعة العقود والمستندات المؤسسية.",
    keywords: buildKeywords([title, fileCategory, isMarketing ? "تسويق" : "مستندات", extension]).slice(0, 8),
    teamNotes: [
      "راجع محتوى الملف يدويًا قبل الاعتماد.",
      "تأكد من أن الاسم والتصنيف والحالة تعكس محتوى الملف الحقيقي.",
      isMarketing ? "يمكن ربطه لاحقًا بالحملة أو المشروع المناسب." : "يفضل إضافة تاريخ أو جهة الملف في الملاحظات عند الحاجة.",
    ],
    confidence: "metadata_only",
  };
}

function sanitizeAnalysis(raw: Record<string, unknown>, fallback: FileAnalysis): FileAnalysis {
  return {
    summary: cleanString(raw.summary, 420) || fallback.summary,
    suggestedCategory: cleanString(raw.suggestedCategory, 120) || fallback.suggestedCategory,
    suggestedUse: cleanString(raw.suggestedUse, 260) || fallback.suggestedUse,
    keywords: cleanArray(raw.keywords, 10, 60).length ? cleanArray(raw.keywords, 10, 60) : fallback.keywords,
    teamNotes: cleanArray(raw.teamNotes, 5, 180).length ? cleanArray(raw.teamNotes, 5, 180) : fallback.teamNotes,
    confidence: raw.confidence === "ai_assisted" ? "ai_assisted" : "metadata_only",
  };
}

function buildKeywords(values: string[]) {
  return Array.from(new Set(values.flatMap((value) => value.split(/[\s_\-.،,\/]+/).map((item) => item.trim()).filter((item) => item.length > 2))));
}

function stripCodeFence(value: string) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cleanString(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanArray(value: unknown, maxItems = 8, maxLen = 80) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item, maxLen)).filter(Boolean).slice(0, maxItems);
}
