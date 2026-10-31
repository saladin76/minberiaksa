import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as failure from "../../lib/ai/core/suggestion-failure";
function fixture(responses: Response[]) {
 let calls = 0; const keys: string[] = [], loaded = { exports: {} as { requestSuggestion: (url: string, body: unknown, signal: AbortSignal) => Promise<unknown>; runSuggestionBatch: (input: object) => Promise<{ done: number; skipped: string[]; sharedFailure: boolean }> } };
 runInNewContext(ts.transpileModule(readFileSync("lib/content-editor/suggestion-batch.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, Error, Set, Response, AbortSignal, crypto: { randomUUID: () => "fixture-acknowledgement-key" }, setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout,
  fetch: async (_url: string, options: RequestInit) => { keys.push(new Headers(options.headers).get("X-Suggestion-Request")!); const response = responses[calls++]; assert.ok(response, "unexpected request retry"); return response; },
  require: (key: string) => { if (key === "../dashboard/i18n") return { dt: (text: string) => text }; if (key === "../ai/core/suggestion-failure") return failure; throw new Error(key); },
 });
 return { ...loaded.exports, calls: () => calls, keys };
}
for (const reason of ["AI_QUOTA_EXCEEDED", "AI_MODEL_UNAVAILABLE", "AI_ACCESS_DENIED", "AI_NOT_CONFIGURED", "AI_INVALID_REQUEST", "AI_TIMEOUT"]) test(`${reason} returns its confirmed failure after one request without acknowledgement retries`, async () => {
 const h = fixture([Response.json({ reason, error: "Controlled fixture failure", stopBatch: true }, { status: 502 })]);
 await assert.rejects(h.requestSuggestion("/fixture", {}, new AbortController().signal), (error: unknown) => (error as { reason?: string }).reason === reason); assert.equal(h.calls(), 1);
});
test("a shared quota failure stops all remaining languages after the initial probe", async () => {
 const h = fixture([Response.json({ reason: "AI_QUOTA_EXCEEDED", error: "Controlled fixture failure", stopBatch: true }, { status: 502 })]);
 const result = await h.runSuggestionBatch({ targets: ["ar", "en", "tr"], signal: new AbortController().signal, request: () => h.requestSuggestion("/fixture", {}, new AbortController().signal), onSuccess: () => assert.fail("no proposal expected"), onError: () => {}, onProgress: () => {} });
 assert.equal(h.calls(), 1); assert.equal(result.done, 1); assert.deepEqual([...result.skipped], ["en", "tr"]); assert.equal(result.sharedFailure, true);
});
test("unconfirmed proxy failures retain bounded retries and the same idempotency key", async () => {
 const h = fixture([new Response("<html>502 proxy</html>", { status: 502 }), new Response("<html>503 proxy</html>", { status: 503 }), Response.json({ ok: true })]);
 assert.deepEqual(await h.requestSuggestion("/fixture", {}, new AbortController().signal), { ok: true }); assert.equal(h.calls(), 3); assert.equal(new Set(h.keys).size, 1);
});
