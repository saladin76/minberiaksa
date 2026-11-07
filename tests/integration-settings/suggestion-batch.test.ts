import test from "node:test";
import assert from "node:assert/strict";
import { runSuggestionBatch, suggestionResponseError, SuggestionRequestError } from "../../lib/content-editor/suggestion-batch";
import { suggestionFailure } from "../../lib/ai/core/suggestion-failure";
import { OpenAiResponseError } from "../../lib/ai/core/openai-response";

for (const reason of ["AI_NOT_CONFIGURED", "AI_ACCESS_DENIED", "AI_MODEL_UNAVAILABLE", "AI_QUOTA_EXCEEDED", "AI_RATE_LIMITED", "AI_INVALID_REQUEST", "AI_PROVIDER_UNAVAILABLE"]) {
  test(`a shared ${reason} failure stops other locale requests without fabricating results`, async () => {
    const requested: string[] = [], failures: string[] = [], successes: string[] = [];
    const result = await runSuggestionBatch({ targets: ["fr", "de", "es"], signal: new AbortController().signal,
      request: async locale => { requested.push(locale); throw suggestionResponseError({ error: "Controlled message", reason }, "fallback"); },
      onError: locale => failures.push(locale), onSuccess: locale => successes.push(locale), onProgress: () => {},
    });
    assert.deepEqual(requested, ["fr"]); assert.deepEqual(failures, ["fr"]); assert.deepEqual(successes, []);
    assert.equal(result.sharedFailure, true); assert.deepEqual(result.skipped, ["de", "es"]); assert.equal(result.done, 1);
  });
}
test("locale-specific output failures preserve other results and accurate progress", async () => {
  const completed: string[] = [], progress: number[] = [];
  const result = await runSuggestionBatch({ targets: ["fr", "de", "es"], signal: new AbortController().signal,
    request: async locale => { if (locale === "de") throw new SuggestionRequestError("Empty output", "AI_EMPTY_RESPONSE"); return locale; },
    onSuccess: (_locale, result) => completed.push(result), onError: () => {}, onProgress: done => progress.push(done),
  });
  assert.deepEqual(completed, ["fr", "es"]); assert.deepEqual(progress, [1, 2, 3]); assert.deepEqual(result.skipped, []); assert.equal(result.sharedFailure, false);
});
test("cancellation does not count an aborted language as completed or start another request", async () => {
  const controller = new AbortController(), calls: string[] = [], completed: string[] = [];
  const result = await runSuggestionBatch({ targets: ["fr", "de"], signal: controller.signal,
    request: async locale => { calls.push(locale); controller.abort(); throw new Error("cancelled"); },
    onSuccess: locale => completed.push(locale), onError: () => { throw new Error("Cancellation is not a provider failure"); }, onProgress: () => {},
  });
  assert.deepEqual(calls, ["fr"]); assert.deepEqual(completed, []); assert.equal(result.done, 0); assert.deepEqual(result.skipped, ["fr", "de"]);
});
test("only controlled provider codes become actionable failures, never raw messages", () => {
  const error = new OpenAiResponseError("AI_ACCESS_DENIED"); error.message = "private-key donor@example.test";
  const failure = suggestionFailure(error)!;
  assert.equal(failure.reason, "AI_ACCESS_DENIED"); assert.equal(failure.stopBatch, true); assert.doesNotMatch(JSON.stringify(failure), /private-key|donor@/);
  assert.equal(suggestionFailure(new Error("private-key")), null);
});

test("an eighteen-language batch stays within the durable queue capacity without rate-limiting itself", async () => {
  let active = 0, maximum = 0; const results: string[] = [], errors: unknown[] = [];
  const targets = Array.from({ length: 18 }, (_, index) => String(index));
  const batch = await runSuggestionBatch({ targets, signal: new AbortController().signal,
    request: async locale => {
      active++; maximum = Math.max(maximum, active);
      try { if (active > 2) throw new SuggestionRequestError("Queue busy", "AI_RATE_LIMITED"); await new Promise(resolve => setTimeout(resolve, 2)); return locale; }
      finally { active--; }
    }, onSuccess: locale => results.push(locale), onError: (_locale, error) => errors.push(error), onProgress: () => {},
  });
  assert.equal(maximum, 2); assert.equal(results.length, 18); assert.deepEqual(errors, []);
  assert.equal(batch.done, 18); assert.equal(batch.sharedFailure, false); assert.deepEqual(batch.skipped, []);
});
