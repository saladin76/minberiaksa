import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isSuggestionFailureCode, stopsSuggestionBatch } from "../../lib/ai/core/suggestion-failure";

function fixture(request: typeof fetch) {
  const loaded = { exports: {} as typeof import("../../lib/content-editor/suggestion-batch") };
  const source = ts.transpileModule(fs.readFileSync("lib/content-editor/suggestion-batch.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, fetch: request, Date, AbortSignal, AbortController, Error, TypeError,
    crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" }, setTimeout: (fn: () => void) => setTimeout(fn, 1), clearTimeout,
    require: (id: string) => {
      if (id === "../dashboard/i18n") return { dt: (text: string) => text };
      if (id === "../ai/core/suggestion-failure") return { isSuggestionFailureCode, stopsSuggestionBatch };
      throw new Error("Unexpected dependency " + id);
    },
  });
  return loaded.exports;
}
test("polling a retained proposal makes one generation request and uses private authenticated same-origin reads", async () => {
  const calls: Array<{ url: string; method: string }> = []; let polls = 0;
  const api = fixture(async (url, options) => {
    calls.push({ url: String(url), method: options?.method || "GET" }); assert.equal(options?.cache, "no-store");
    if (options?.method === "POST") { assert.equal((options.headers as Record<string, string>).Prefer, "respond-async"); return Response.json({ taskId: "a".repeat(64) }, { status: 202 }); }
    polls++; return polls === 1 ? Response.json({ status: "RUNNING" }, { status: 202 }) : Response.json({ revision: "same", proposals: { en: { title: "Reviewed" } } });
  });
  const result = await api.requestSuggestion<{ revision: string }>("/api/admin/content-editor/campaigns/fixture/suggest", { revision: "same" }, new AbortController().signal);
  assert.equal(result.revision, "same"); assert.equal(calls.filter(call => call.method === "POST").length, 1);
  assert.ok(calls.slice(1).every(call => call.url === "/api/admin/ai/suggestions/" + "a".repeat(64)));
});
test("network failure stops the rest of a language batch instead of repeatedly charging requests", async () => {
  let calls = 0;
  const api = fixture(async () => { calls++; throw new TypeError("Network unavailable"); });
  const result = await api.runSuggestionBatch({ targets: ["en", "fr", "tr"], signal: new AbortController().signal,
    request: () => api.requestSuggestion("/suggest", {}, new AbortController().signal), onSuccess: () => assert.fail("No result expected"), onError: () => {}, onProgress: () => {},
  });
  assert.equal(calls, 1); assert.equal(result.sharedFailure, true); assert.equal(result.skipped.length, 2);
});
test("cancelling a queued suggestion requests cancellation without starting another generation", async () => {
  const controller = new AbortController(); let cancelled = 0;
  const api = fixture(async (_url, options) => {
    if (options?.method === "POST") { setTimeout(() => controller.abort(), 0); return Response.json({ taskId: "a".repeat(64) }, { status: 202 }); }
    if (options?.method === "DELETE") { cancelled++; return Response.json({ ok: true }); }
    return Response.json({ status: "RUNNING" }, { status: 202 });
  });
  await assert.rejects(api.requestSuggestion("/suggest", {}, controller.signal)); assert.equal(cancelled, 1);
});

test("revoked source permission stops the remaining languages before another suggestion is queued", async () => {
  let calls = 0;
  const api = fixture(async () => { calls++; return Response.json({ error: "Forbidden" }, { status: 403 }); });
  const result = await api.runSuggestionBatch({ targets: ["en", "fr"], signal: new AbortController().signal,
    request: () => api.requestSuggestion("/suggest", {}, new AbortController().signal), onSuccess: () => assert.fail("No result expected"), onError: () => {}, onProgress: () => {},
  });
  assert.equal(calls, 1); assert.equal(result.sharedFailure, true); assert.equal(result.skipped.length, 1);
});
