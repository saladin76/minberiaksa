import { isSuggestionFailureCode, stopsSuggestionBatch } from "../ai/core/suggestion-failure";

export class SuggestionRequestError extends Error {
  constructor(message: string, public reason?: string) { super(message); }
}
export function suggestionResponseError(body: { error?: unknown; reason?: unknown }, fallback: string) {
  return new SuggestionRequestError(typeof body.error === "string" ? body.error : fallback, isSuggestionFailureCode(body.reason) ? body.reason : undefined);
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
    catch (error) { if (!input.signal.aborted) { input.onError(locale, error); stop = error instanceof SuggestionRequestError && stopsSuggestionBatch(error.reason); } }
    finally { if (!input.signal.aborted) { done++; input.onProgress(done, input.targets.length); } }
    if (stop || input.signal.aborted) return { done, skipped: input.targets.slice(done), sharedFailure: stop };
  }
  return { done, skipped: input.targets.slice(done), sharedFailure: false };
}
