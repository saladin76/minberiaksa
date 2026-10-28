import { dt } from "../dashboard/i18n";
import { isSuggestionFailureCode, stopsSuggestionBatch } from "../ai/core/suggestion-failure";

const RESPONSE_FAILURES = new Set(["SUGGESTION_RESPONSE_INVALID", "SUGGESTION_SESSION_EXPIRED", "SUGGESTION_TIMEOUT"]);

export class SuggestionRequestError extends Error {
  constructor(message: string, public reason?: string) { super(message); }
}
export function suggestionResponseError(body: { error?: unknown; reason?: unknown }, fallback: string) {
  return new SuggestionRequestError(typeof body.error === "string" ? body.error : fallback, isSuggestionFailureCode(body.reason) || (typeof body.reason === "string" && RESPONSE_FAILURES.has(body.reason)) ? body.reason as string : undefined);
}
/** Process one locale at a time and stop a shared provider failure before spending on other locales. */
export async function runSuggestionBatch<T>(input: {
  targets: readonly string[]; signal: AbortSignal; request: (locale: string) => Promise<T>;
  onSuccess: (locale: string, result: T) => void; onError: (locale: string, error: unknown) => void;
  onProgress: (done: number, total: number) => void;
}) {
  let done = 0;
  for (const locale of input.targets) {
    if (input.signal.aborted) break;
    let stop = false;
    try { const result = await input.request(locale); if (!input.signal.aborted) input.onSuccess(locale, result); }
    catch (error) { if (!input.signal.aborted) { input.onError(locale, error); stop = error instanceof SuggestionRequestError && (stopsSuggestionBatch(error.reason) || RESPONSE_FAILURES.has(error.reason || "")); } }
    finally { if (!input.signal.aborted) { done++; input.onProgress(done, input.targets.length); } }
    if (stop || input.signal.aborted) return { done, skipped: input.targets.slice(done), sharedFailure: stop };
  }
  return { done, skipped: input.targets.slice(done), sharedFailure: false };
}

/** Proxies and expired sessions can return HTML. Never expose or parse that as a proposal. */
export async function readSuggestionJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (response.redirected || response.status === 401) throw new SuggestionRequestError(dt("انتهت جلسة الدخول. سجّل الدخول مجددًا ثم أعد الطلب؛ المسودة لم تتغير."), "SUGGESTION_SESSION_EXPIRED");
  if (!body || typeof body !== "object") {
    if (response.status === 504 || response.status === 408) throw new SuggestionRequestError(dt("انتهت مهلة الخادم قبل تأكيد النتيجة. احتفظ بالمسودة وجرّب لغة واحدة بعد مراجعة الاتصال."), "SUGGESTION_TIMEOUT");
    throw new SuggestionRequestError(dt("أعاد الخادم صفحة غير متوقعة بدل نتيجة الاقتراح. احتفظ بالمسودة وراجع اتصال الخادم قبل إعادة الطلب."), "SUGGESTION_RESPONSE_INVALID");
  }
  if (!response.ok) throw suggestionResponseError(body, fallback);
  return body as T;
}
