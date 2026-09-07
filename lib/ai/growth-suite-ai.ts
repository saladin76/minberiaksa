import { getBrandAiSourcePack } from "@/lib/brand/brand-service";
import { recordAiAuditLog } from "./core/ai-audit-log";
import type { AiAssistantContextKey } from "./core/ai-core-types";

export type GrowthSuiteAiContext = "marketing" | "operations" | "archive" | "brand";
export type GrowthSuiteAiAction =
  | "reviewCopyAgainstBrandVoice"
  | "suggestMessageFramework"
  | "translateWithBrandVoice"
  | "campaignCopyGuard";

export type GrowthSuiteAiPayload = {
  action: GrowthSuiteAiAction;
  context?: GrowthSuiteAiContext;
  profileId?: string | null;
  copy?: string;
  sourceCopy?: string;
  targetLocale?: string;
  locale?: string;
  contentType?: string;
  purpose?: string;
  audience?: string;
  user?: string;
};

const forbiddenTerms = [
  "guaranteed result",
  "100% guaranteed",
  "instant miracle",
  "مضمون 100%",
  "معجزة فورية",
  "اجباري",
];

function auditContext(context: GrowthSuiteAiContext): AiAssistantContextKey {
  if (context === "operations") return "content";
  return context;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function includesAny(copy: string, terms: string[]) {
  const lower = copy.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function hasCta(copy: string) {
  return /(donate|give|support|bağış|destek|تبرع|ادعم|ساهم)/i.test(copy);
}

function hasProofCue(copy: string) {
  return /(receipt|report|proof|certificate|field update|makbuz|rapor|kanıt|sertifika|إيصال|تقرير|إثبات|شهادة|تحديث)/i.test(copy);
}

function buildBasePrompt(input: GrowthSuiteAiPayload) {
  return JSON.stringify({
    action: input.action,
    context: input.context ?? "brand",
    profileId: input.profileId ?? null,
    locale: input.locale ?? input.targetLocale ?? null,
    contentType: input.contentType ?? null,
    purpose: input.purpose ?? null,
    copy: input.copy ?? input.sourceCopy ?? "",
  });
}

export async function runGrowthSuiteAiAction(input: GrowthSuiteAiPayload) {
  const context = input.context ?? "brand";
  const source = getBrandAiSourcePack(input.profileId);
  const copy = (input.copy ?? input.sourceCopy ?? "").trim();
  const forbiddenWordsFound = includesAny(copy, forbiddenTerms);
  const proofCue = hasProofCue(copy);
  const cta = hasCta(copy);
  const lengthPenalty = copy.length > 700 ? 12 : copy.length < 40 ? 8 : 0;
  const issuePenalty = forbiddenWordsFound.length * 15 + (proofCue ? 0 : 8) + (cta ? 0 : 6) + lengthPenalty;
  const clarityScore = clampScore(88 - lengthPenalty - (cta ? 0 : 8));
  const donorDignityScore = clampScore(92 - forbiddenWordsFound.length * 18);
  const ctaScore = clampScore(cta ? 86 : 55);
  const brandScore = clampScore(90 - issuePenalty);

  const audit = recordAiAuditLog({
    prompt: buildBasePrompt(input),
    context: auditContext(context),
    requestedTool: "getBrandRules",
    user: input.user || "dashboard-user",
    status: "COMPLETED",
  });

  const common = {
    action: input.action,
    context,
    profileId: source.profile.id,
    profileName: source.profile.name,
    mode: "DRAFT_FOUNDATION" as const,
    auditId: audit.id,
    requiresHumanApproval: true,
    blockedActions: [
      "AI does not send messages",
      "AI does not publish content",
      "AI does not change budgets",
      "AI does not change tracking settings",
    ],
    source: {
      profile: source.profile.name,
      guidelines: source.guidelines.map((guideline) => guideline.title),
      frameworks: source.frameworks.map((framework) => framework.name),
    },
  };

  if (input.action === "suggestMessageFramework") {
    const framework = source.frameworks.find((item) => item.locale === (input.locale || source.profile.primaryLocale)) ?? source.frameworks[0];
    return {
      ...common,
      output: {
        hook: input.purpose ? `${input.purpose}: start with a human, proof-led line.` : "Start with a human, proof-led line.",
        empathy: "Recognize the donor's intention without guilt or pressure.",
        proof: "Add receipt, certificate, report, or field update cue where available.",
        cta: "Use one direct donation action.",
        closing: "Close with a calm trust cue and human review note.",
        recommendedFramework: framework?.name ?? "General",
        structure: framework?.structure ?? ["Need", "Proof", "CTA"],
      },
    };
  }

  if (input.action === "translateWithBrandVoice") {
    return {
      ...common,
      output: {
        translation: copy ? `[draft ${input.targetLocale || "target"}] ${copy}` : "Translation draft requires source copy.",
        toneNotes: [source.profile.contentVoice, "Keep proof and donor dignity cues intact."],
        localizationNotes: ["Review by a native speaker before sending.", "Do not translate legal or official names without verification."],
      },
    };
  }

  if (input.action === "campaignCopyGuard") {
    return {
      ...common,
      output: {
        safe: forbiddenWordsFound.length === 0 && brandScore >= 70,
        clarityScore,
        donorDignityScore,
        ctaScore,
        issues: [
          ...forbiddenWordsFound.map((term) => `Forbidden or risky term: ${term}`),
          ...(proofCue ? [] : ["Add a receipt, report, certificate, or field update proof cue."]),
          ...(cta ? [] : ["Add one clear donation CTA."]),
        ],
        recommendation: brandScore >= 80 ? "Safe as a draft after human review." : "Needs edit before review approval.",
      },
    };
  }

  return {
    ...common,
    output: {
      score: brandScore,
      issues: [
        ...forbiddenWordsFound.map((term) => `Remove risky phrase: ${term}`),
        ...(proofCue ? [] : ["Missing proof cue"]),
        ...(cta ? [] : ["Missing clear CTA"]),
      ],
      suggestedRewrite: copy
        ? `${copy}\n\nDraft note: add verified proof, one clear CTA, and keep the final wording under human approval.`
        : "Add copy to review against the active brand voice.",
      forbiddenWordsFound,
      toneNotes: [source.profile.contentVoice, source.profile.messagePhilosophy],
    },
  };
}
