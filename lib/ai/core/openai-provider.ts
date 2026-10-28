import { getOpenAiRuntime } from "./connection-settings";
import { openAiResponseText } from "./openai-response";
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

export async function getOpenAiProviderStatus(runtime?: Awaited<ReturnType<typeof getOpenAiRuntime>>): Promise<AiProviderStatus> {
  const config = runtime ?? await getOpenAiRuntime();
  return {
    provider: "openai", configured: config.configured, externalCallsEnabled: config.enabled,
    model: config.configured ? config.model : null, baseUrl: config.baseUrl,
    mode: config.apiKey ? "ready" : "safe-fallback",
    reason: config.error ? "AI connection settings are unavailable." : config.apiKey ? "The shared OpenAI connection is configured and enabled." : config.configured ? "The shared OpenAI connection is disabled." : "The shared OpenAI connection has no key.",
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
  const runtime = await getOpenAiRuntime();
  const status = await getOpenAiProviderStatus(runtime);
  if (status.mode !== "ready" || !runtime.apiKey) {
    return {
      mode: "SAFE_FALLBACK",
      status: "FALLBACK",
      answer: fallbackAnswer(input, status.reason),
    };
  }

  try {
    const response = await fetch(`${status.baseUrl}/responses`, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${runtime.apiKey}`,
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

    const json = await response.json().catch(() => null) as unknown;
    return {
      mode: "OPENAI",
      status: "COMPLETED",
      answer: openAiResponseText(json),
    };
  } catch {
    return {
      mode: "SAFE_FALLBACK",
      status: "FAILED",
      answer: fallbackAnswer(input, "OpenAI request failed safely."),
    };
  }
}
