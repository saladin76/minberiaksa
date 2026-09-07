import type { AiAssistantContextDefinition, AiProviderStatus } from "./ai-core-types";

type ProviderDraftInput = {
  context: AiAssistantContextDefinition;
  prompt: string;
  systemSafety: string[];
};

type ProviderDraftResult = {
  mode: "SAFE_FALLBACK" | "OPENAI";
  answer: string;
  status: "FALLBACK" | "COMPLETED" | "FAILED";
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

function externalCallsEnabled() {
  return process.env.AI_CORE_ENABLE_EXTERNAL_CALLS === "true";
}

function openAiModel() {
  return process.env.AI_CORE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function openAiBaseUrl() {
  return (process.env.AI_CORE_OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
}

export function getOpenAiProviderStatus(): AiProviderStatus {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  const callsEnabled = externalCallsEnabled();
  return {
    provider: "openai",
    configured,
    externalCallsEnabled: callsEnabled,
    model: configured ? openAiModel() : null,
    baseUrl: openAiBaseUrl(),
    mode: configured && callsEnabled ? "ready" : "safe-fallback",
    reason: configured
      ? callsEnabled
        ? "OpenAI provider is configured on the server and external calls are explicitly enabled."
        : "OPENAI_API_KEY is present, but AI_CORE_ENABLE_EXTERNAL_CALLS is not true."
      : "OPENAI_API_KEY is not configured on the server.",
  };
}

function fallbackAnswer(input: ProviderDraftInput, reason: string) {
  return [
    `AI Core استقبل الطلب داخل سياق ${input.context.title}.`,
    `لم يتم تنفيذ اتصال خارجي: ${reason}`,
    "يمكنني الآن تجهيز خطة قراءة، قائمة أدوات مقترحة، أو مسودة تحتاج مراجعة بشرية قبل أي إجراء.",
  ].join("\n");
}

export async function generateOpenAiDraft(input: ProviderDraftInput): Promise<ProviderDraftResult> {
  const status = getOpenAiProviderStatus();
  if (status.mode !== "ready" || !process.env.OPENAI_API_KEY) {
    return {
      mode: "SAFE_FALLBACK",
      status: "FALLBACK",
      answer: fallbackAnswer(input, status.reason),
    };
  }

  try {
    const response = await fetch(`${status.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: status.model,
        input: [
          `Role: ${input.context.systemRole}`,
          `Safety rules: ${input.systemSafety.join(" | ")}`,
          `User request: ${input.prompt}`,
        ].join("\n\n"),
      }),
    });

    if (!response.ok) {
      return {
        mode: "SAFE_FALLBACK",
        status: "FAILED",
        answer: fallbackAnswer(input, `OpenAI API returned ${response.status}.`),
      };
    }

    const json = await response.json().catch(() => null) as { output_text?: string } | null;
    return {
      mode: "OPENAI",
      status: "COMPLETED",
      answer: json?.output_text?.trim() || fallbackAnswer(input, "OpenAI response did not include output_text."),
    };
  } catch {
    return {
      mode: "SAFE_FALLBACK",
      status: "FAILED",
      answer: fallbackAnswer(input, "OpenAI request failed safely."),
    };
  }
}
