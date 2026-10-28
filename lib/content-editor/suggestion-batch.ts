import { dt } from "../dashboard/i18n";
import { isSuggestionFailureCode, stopsSuggestionBatch } from "../ai/core/suggestion-failure";

const RESPONSE_FAILURES = new Set(["SUGGESTION_RESPONSE_INVALID", "SUGGESTION_SESSION_EXPIRED", "SUGGESTION_PERMISSION_DENIED", "SUGGESTION_TIMEOUT"]);

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
  if (response.status === 403) throw new SuggestionRequestError(dt("لا تتوفر لديك صلاحيات هذا الطلب. راجع صلاحيات القسم ومصادر البيانات."), "SUGGESTION_PERMISSION_DENIED");
  if (!body || typeof body !== "object") {
    if (response.status === 504 || response.status === 408) throw new SuggestionRequestError(dt("انتهت مهلة الخادم قبل تأكيد النتيجة. احتفظ بالمسودة وأعد المحاولة بعد مراجعة الاتصال."), "SUGGESTION_TIMEOUT");
    throw new SuggestionRequestError(dt("أعاد الخادم صفحة غير متوقعة بدل البيانات المطلوبة. احتفظ بالمسودة وراجع اتصال الخادم قبل إعادة الطلب."), "SUGGESTION_RESPONSE_INVALID");
  }
  if (!response.ok) {
    const error = suggestionResponseError(body, fallback);
    if (!error.reason && response.status >= 500) error.reason = "SUGGESTION_RESPONSE_INVALID";
    throw error;
  }
  return body as T;
}

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, 1200);
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
async function fetchSuggestion(url: string, options: RequestInit, signal: AbortSignal) {
  try { return await fetch(url, options); }
  catch (error) {
    if (signal.aborted) throw error;
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new SuggestionRequestError(dt("تعذر تأكيد طلب الاقتراح. احتفظ بالمسودة وراجع اتصال الخادم قبل إعادة الطلب."), timedOut ? "SUGGESTION_TIMEOUT" : "SUGGESTION_RESPONSE_INVALID");
  }
}
/** One suggestion request per locale. Polling reads a retained result and never regenerates content. */
export async function requestSuggestion<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const fallback = dt("تعذر إعداد الاقتراح");
  const request = { method: "POST", cache: "no-store" as const,
    headers: { "Content-Type": "application/json", Prefer: "respond-async", "X-Suggestion-Request": crypto.randomUUID() },
    body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) };
  let response = await fetchSuggestion(url, request, signal);
  if (response.status !== 202) return readSuggestionJson<T>(response, fallback);
  const queued = await readSuggestionJson<{ taskId?: string }>(response, fallback);
  if (!queued.taskId || !/^[a-f0-9]{64}$/.test(queued.taskId)) throw new SuggestionRequestError(fallback, "SUGGESTION_RESPONSE_INVALID");
  const taskUrl = "/api/admin/ai/suggestions/" + queued.taskId;
  const cancel = () => { void fetch(taskUrl, { method: "DELETE", cache: "no-store", keepalive: true, signal: AbortSignal.timeout(8000) }).catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const deadline = Date.now() + 285_000;
  try {
    if (signal.aborted) { cancel(); signal.throwIfAborted(); }
    while (Date.now() < deadline) {
      await pause(signal);
      response = await fetchSuggestion(taskUrl, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }, signal);
      if (response.status !== 202) return await readSuggestionJson<T>(response, fallback);
    }
    throw new SuggestionRequestError(dt("انتهت مهلة تجهيز الاقتراح. المحتوى لم يتغير؛ راجع الاتصال ثم أعد المحاولة."), "SUGGESTION_TIMEOUT");
  } catch (error) { if (!signal.aborted) cancel(); throw error; }
  finally { signal.removeEventListener("abort", cancel); }
}
