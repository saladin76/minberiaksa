import { listAiAuditLogEntries, recordAiAuditLog } from "./ai-audit-log";
import { aiHumanApprovalRules, aiToolContracts, findAiToolContract, getAiToolContractsForContext } from "./ai-tool-contracts";
import type { AiAssistantContextDefinition, AiAssistantContextKey, AiAssistantReadiness, AiAuditStatus, AiCoreOverview, AiDraftResponse } from "./ai-core-types";
import { generateOpenAiDraft, getOpenAiProviderStatus } from "./openai-provider";

// Shared AI contexts for dashboard assistants.
// Provider calls stay behind server-side configuration and safe fallbacks.
export const aiAssistantContexts: AiAssistantContextDefinition[] = [
  {
    key: "marketing",
    title: "Marketing AI Assistant",
    description: "يساعد فريق التسويق في تحليل النتائج، ROAS، جودة التتبع، وأفكار تحسين الحملات.",
    systemRole: "Marketing performance analyst for donation growth.",
    capabilities: ["ANALYZE_RESULTS", "SUMMARIZE_EXECUTIVE", "WRITE_COPY"],
    allowedSources: ["getMarketingOverview", "getCampaignLinks", "getCampaignLinkDetail", "getConversionTimeline", "getTrackingTruth", "getBrandRules"],
    blockedActions: ["No budget changes", "No external platform calls", "No campaign publishing", "No tracking setting changes"],
    entryHref: "/dashboard/marketing/ai-assistant",
  },
  {
    key: "content",
    title: "Content AI Assistant",
    description: "يساعد فريق المحتوى في بناء خطط المواسم، النصوص، الكاروسيل، وجدولة المواد.",
    systemRole: "Content planning assistant for Islamic charity campaigns.",
    capabilities: ["PLAN_CONTENT", "WRITE_COPY", "SUMMARIZE_EXECUTIVE"],
    allowedSources: ["getContentSchedule", "getProductionBoard", "getArchiveSummary", "getBrandRules"],
    blockedActions: ["No auto publishing", "No message sending", "No external platform calls"],
    entryHref: "/dashboard/operations/ai-assistant",
  },
  {
    key: "archive",
    title: "Archive AI Assistant",
    description: "يساعد في البحث داخل الأرشيف، اقتراح مواد قابلة لإعادة الاستخدام، وتصنيف الأصول.",
    systemRole: "Archive retrieval and asset reuse assistant.",
    capabilities: ["SEARCH_ARCHIVE", "PLAN_CONTENT", "BRAND_GUARDRAILS"],
    allowedSources: ["getArchiveSummary", "getBrandRules"],
    blockedActions: ["No file deletion", "No public publishing", "No external platform calls"],
    entryHref: "/dashboard/archive/ai",
  },
];

const promptExamples: Partial<Record<AiAssistantContextKey, string[]>> = {
  marketing: [
    "لخص روابط الحملات التي جلبت تبرعات حقيقية لكن Tracking Truth فيها ناقص.",
    "اقترح أولويات إصلاح Meta/GA4 قبل زيادة الميزانية.",
    "قارن Campaign Links النشطة وحدد أيها آمن للمراقبة فقط.",
  ],
  content: [
    "اقترح خطة محتوى للأسبوع القادم بناءً على الإنتاج والجدولة.",
    "ما المواد الجاهزة التي يمكن تسليمها للتسويق بعد مراجعة بشرية؟",
    "اكتب مسودة واتساب لحملة الوقف مع الالتزام بقواعد الصياغة المعتمدة.",
  ],
  archive: [
    "اعثر على مواد أرشيف قابلة لإعادة الاستخدام لحملة غزة.",
    "اقترح tags للمواد الجاهزة بدون تعديل الملفات.",
    "ما الأصول التي تصلح لفيديو قصير مع قواعد الصياغة المعتمدة؟",
  ],
};

export function getAiCoreOverview(): AiCoreOverview {
  return {
    source: "shared-ai-core-skeleton",
    generatedAt: new Date().toISOString(),
    summary: {
      contexts: aiAssistantContexts.length,
      capabilities: new Set(aiAssistantContexts.flatMap((context) => context.capabilities)).size,
      protectedActions: aiAssistantContexts.flatMap((context) => context.blockedActions).length,
      toolContracts: aiToolContracts.length,
    },
    contexts: aiAssistantContexts,
    toolContracts: aiToolContracts,
    humanApprovalRules: aiHumanApprovalRules,
    provider: getOpenAiProviderStatus(),
    audit: {
      mode: "memory-foundation",
      recent: listAiAuditLogEntries(),
    },
  };
}

export function getAiContext(key: AiAssistantContextKey) {
  return aiAssistantContexts.find((context) => context.key === key) ?? null;
}

export function getAiAssistantReadiness(contextKey: AiAssistantContextKey): AiAssistantReadiness | null {
  const context = getAiContext(contextKey);
  if (!context) return null;
  return {
    context,
    tools: getAiToolContractsForContext(contextKey),
    humanApprovalRules: aiHumanApprovalRules,
    provider: getOpenAiProviderStatus(),
    promptExamples: promptExamples[contextKey] ?? [],
  };
}

export async function createAiDraftResponse(
  contextKey: AiAssistantContextKey,
  prompt: string,
  options: { requestedTool?: string | null; user?: string | null } = {},
): Promise<AiDraftResponse> {
  const context = getAiContext(contextKey);
  const requestedTool = findAiToolContract(options.requestedTool);
  const requestedToolAllowed = requestedTool ? requestedTool.contexts.includes(contextKey) : true;
  if (!context || !requestedToolAllowed) {
    const audit = recordAiAuditLog({
      prompt,
      context: contextKey,
      requestedTool: requestedTool?.name ?? null,
      user: options.user || "unknown",
      status: "BLOCKED",
    });
    return {
      context: contextKey,
      mode: "SAFE_FALLBACK",
      title: "AI Core رفض الطلب",
      answer: "الأداة المطلوبة غير مسموحة لهذا السياق أوالسياق غير معروف.",
      requestedTool: requestedTool?.name ?? null,
      auditId: audit.id,
      provider: getOpenAiProviderStatus(),
      suggestedNextActions: ["اختر أداة مناسبة للسياق.", "راجع tool contracts قبل إعادة المحاولة."],
      safety: { requiresHumanApproval: true, blockedActions: aiHumanApprovalRules.map((rule) => rule.action) },
    };
  }

  const providerResult = await generateOpenAiDraft({
    context,
    prompt,
    systemSafety: aiHumanApprovalRules.map((rule) => rule.rule),
  });
  const auditStatus: AiAuditStatus = providerResult.status;
  const audit = recordAiAuditLog({
    prompt,
    context: contextKey,
    requestedTool: requestedTool?.name ?? null,
    user: options.user || "unknown",
    status: auditStatus,
  });

  return {
    context: contextKey,
    mode: providerResult.mode,
    title: `${context.title} جاهز للربط`,
    answer: providerResult.answer || `تم استقبال الطلب: ${prompt.trim() || "بدون نص"}.`,
    requestedTool: requestedTool?.name ?? null,
    auditId: audit.id,
    provider: getOpenAiProviderStatus(),
    suggestedNextActions: [
      "راجع مصادر البيانات المسموحة قبل استخدام التحليل.",
      "حوّل أي اقتراح إرسال أونشر أوميزانية إلى طلب موافقة بشرية.",
      "استخدم tool contracts المناسبة للسياق بدل شات عام.",
    ],
    safety: {
      requiresHumanApproval: true,
      blockedActions: context.blockedActions,
    },
  };
}
