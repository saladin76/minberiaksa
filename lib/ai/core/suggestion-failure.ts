import { OpenAiResponseError } from "./openai-response";
import { providerErrorMessage } from "./provider-error-message";

const CODES = new Set(["AI_NOT_CONFIGURED", "AI_SETTINGS_UNAVAILABLE", "AI_ACCESS_DENIED", "AI_MODEL_UNAVAILABLE", "AI_QUOTA_EXCEEDED", "AI_RATE_LIMITED", "AI_INVALID_REQUEST", "AI_PROVIDER_UNAVAILABLE", "AI_TIMEOUT", "AI_OUTPUT_INCOMPLETE", "AI_OUTPUT_INVALID", "AI_EMPTY_RESPONSE", "AI_RESPONSE_REFUSED"]);
const SHARED = new Set(["AI_NOT_CONFIGURED", "AI_SETTINGS_UNAVAILABLE", "AI_ACCESS_DENIED", "AI_MODEL_UNAVAILABLE", "AI_QUOTA_EXCEEDED", "AI_RATE_LIMITED", "AI_INVALID_REQUEST", "AI_PROVIDER_UNAVAILABLE", "AI_TIMEOUT"]);
export function isSuggestionFailureCode(code: unknown): code is string { return typeof code === "string" && CODES.has(code); }
export function stopsSuggestionBatch(code: unknown) { return isSuggestionFailureCode(code) && SHARED.has(code); }
/** Provider responses and thrown messages never cross this boundary. */
export function suggestionFailure(error: unknown) {
  const candidate = error instanceof OpenAiResponseError ? error.code : error && typeof error === "object" && "reason" in error ? error.reason : undefined;
  const code = isSuggestionFailureCode(candidate) ? candidate : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "AI_TIMEOUT" : null;
  const details = error instanceof OpenAiResponseError ? error.details : undefined;
  const stage = details?.stage === "WEB_RESEARCH" ? "WEB_RESEARCH" : details?.stage === "TRANSLATION" ? "TRANSLATION" : undefined;
  const field = ["MODEL", "SEARCH_TOOL", "OUTPUT_FORMAT", "TEMPERATURE"].includes(details?.field || "") ? details!.field : undefined;
  const message = code === "AI_INVALID_REQUEST" && field ? providerErrorMessage("AI_INVALID_" + field) : providerErrorMessage(code || undefined);
  return code ? { error: message + (stage ? " " + providerErrorMessage("AI_STAGE_" + stage) : ""), reason: code, ...(stage || field ? { details: { ...(stage ? { stage } : {}), ...(field ? { field } : {}) } } : {}), stopBatch: stopsSuggestionBatch(code), status: ["AI_NOT_CONFIGURED", "AI_SETTINGS_UNAVAILABLE"].includes(code) ? 503 : 502 } : null;
}
