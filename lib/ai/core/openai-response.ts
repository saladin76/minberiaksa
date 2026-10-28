/** Only controlled codes leave this boundary; provider bodies can contain prompts or secrets. */
export type OpenAiFailureDetails = { stage?: "WEB_RESEARCH" | "TRANSLATION"; field?: "MODEL" | "SEARCH_TOOL" | "OUTPUT_FORMAT" | "TEMPERATURE"; providerCode?: "unsupported_parameter" | "unsupported_value" | "invalid_value" | "invalid_request_error" };
export class OpenAiResponseError extends Error {
  constructor(public readonly code: string, public readonly details?: OpenAiFailureDetails) { super(code); this.name = "OpenAiResponseError"; }
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export async function openAiFailure(response: Response, stage?: OpenAiFailureDetails["stage"]): Promise<OpenAiResponseError> {
  const payload = await response.json().catch(() => null);
  const upstream = record(record(payload).error), code = upstream.code;
  const parameter = upstream.param;
  const field: OpenAiFailureDetails["field"] = parameter === "model" ? "MODEL" : typeof parameter === "string" && /^tools(?:\[0\]|\.0)?(?:\.(?:type|search_context_size))?$/.test(parameter) ? "SEARCH_TOOL"
    : ["text.format", "text.format.type", "response_format", "response_format.type"].includes(String(parameter)) ? "OUTPUT_FORMAT" : parameter === "temperature" ? "TEMPERATURE" : undefined;
  const providerCode = ["unsupported_parameter", "unsupported_value", "invalid_value", "invalid_request_error"].includes(String(code)) ? code as OpenAiFailureDetails["providerCode"] : undefined;
  const details = { ...(stage ? { stage } : {}), ...(field ? { field } : {}), ...(providerCode ? { providerCode } : {}) };
  if (code === "insufficient_quota") return new OpenAiResponseError("AI_QUOTA_EXCEEDED");
  if (code === "model_not_found" || response.status === 404) return new OpenAiResponseError("AI_MODEL_UNAVAILABLE");
  if (response.status === 401 || response.status === 403) return new OpenAiResponseError("AI_ACCESS_DENIED");
  if (response.status === 429) return new OpenAiResponseError("AI_RATE_LIMITED");
  if (response.status === 400 || response.status === 422) return new OpenAiResponseError("AI_INVALID_REQUEST", details);
  return new OpenAiResponseError("AI_PROVIDER_UNAVAILABLE");
}
/** REST responses place text inside output/message/content, unlike the SDK convenience field. */
export function openAiResponseText(payload: unknown): string {
  const body = record(payload);
  if (body.status === "incomplete") throw new OpenAiResponseError("AI_OUTPUT_INCOMPLETE");
  if (body.status === "failed") throw new OpenAiResponseError("AI_PROVIDER_UNAVAILABLE");
  const output = Array.isArray(body.output) ? body.output : [];
  const blocks = output.flatMap(item => Array.isArray(record(item).content) ? record(item).content as unknown[] : []);
  if (blocks.some(block => record(block).type === "refusal")) throw new OpenAiResponseError("AI_RESPONSE_REFUSED");
  const text = typeof body.output_text === "string" && body.output_text.trim() ? body.output_text : blocks.filter(block => record(block).type === "output_text").map(block => typeof record(block).text === "string" ? record(block).text : "").join("\n");
  if (!text.trim()) throw new OpenAiResponseError("AI_EMPTY_RESPONSE");
  return text.trim();
}
