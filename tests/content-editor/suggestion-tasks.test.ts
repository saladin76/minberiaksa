import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import { providerErrorMessage } from "../../lib/ai/core/provider-error-message";

function fixture() {
  const tasks = new Map<string, Record<string, unknown>>();
  const callbacks: Array<() => Promise<void>> = [];
  const matches = (row: Record<string, unknown>, query: Record<string, unknown>): boolean => Object.entries(query).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value) return (value.in as unknown[]).includes(row[key]);
    if (value && typeof value === "object" && "gt" in value) return row[key] as Date > (value.gt as Date);
    return row[key] === value;
  });
  const prisma = { aiSuggestionTask: {
    findUnique: async ({ where }: { where: { id: string } }) => tasks.get(where.id) ?? null,
    count: async ({ where }: { where: Record<string, unknown> }) => [...tasks.values()].filter(row => matches(row, where)).length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (tasks.has(String(data.id))) throw { code: "P2002" };
      const row = { status: "QUEUED", ...data }; tasks.set(String(data.id), row); return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0; for (const row of tasks.values()) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
  } };
  type Service = typeof import("../../lib/content-editor/suggestion-tasks");
  const loaded = { exports: {} as Service };
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "node:crypto": crypto, "@/lib/prisma": { prisma },
    "next/server": { NextRequest: Request, NextResponse: { json: Response.json }, after: (fn: () => Promise<void>) => callbacks.push(fn) },
    "@/lib/ai/core/provider-error-message": { providerErrorMessage },
  };
  const source = ts.transpileModule(fs.readFileSync("lib/content-editor/suggestion-tasks.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, Date, Map, Buffer, AbortSignal, AbortController, setInterval, clearInterval, require: (id: string) => {
    if (!(id in dependencies)) throw new Error("Unexpected dependency " + id); return dependencies[id];
  } });
  const request = (body = { revision: "draft", locale: "fr" }, id = "11111111-1111-4111-8111-111111111111", signal?: AbortSignal) => new Request("https://example.test/api/admin/content-editor/campaigns/111111111111111111111111/suggest", {
    method: "POST", headers: { Prefer: "respond-async", "X-Suggestion-Request": id }, body: JSON.stringify(body), signal,
  }) as Parameters<Service["queueSuggestion"]>[0];
  return { tasks, callbacks, request, service: loaded.exports };
}

test("a suggestion returns before generation, survives HTTP cancellation and retains the exact controlled failure", async () => {
  const h = fixture(), controller = new AbortController(); let generations = 0;
  const queued = await h.service.queueSuggestion(h.request(undefined, undefined, controller.signal), "operator", "campaigns", async request => {
    generations++; assert.equal(request.headers.get("Prefer"), null); assert.equal(request.signal.aborted, false);
    assert.equal((await request.json()).locale, "fr");
    return Response.json({ error: "Controlled quota message", reason: "AI_QUOTA_EXCEEDED", stopBatch: true }, { status: 502 });
  });
  assert.equal(queued.status, 202); assert.equal(generations, 0);
  const { taskId } = await queued.json(); controller.abort(); await h.callbacks[0]();
  const task = await h.service.readSuggestionTask(taskId, "operator"); assert.ok(task);
  const response = await h.service.suggestionTaskResponse(task);
  assert.equal(response.status, 502); assert.equal((await response.json()).reason, "AI_QUOTA_EXCEEDED");
  assert.equal(generations, 1); assert.equal(await h.service.readSuggestionTask(taskId, "another-operator"), null);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.doesNotMatch(JSON.stringify(h.tasks.get(taskId)), /"revision":"draft"/);
});

test("an idempotent replay schedules no second generation; a different snapshot cannot reuse the key", async () => {
  const h = fixture(); let generations = 0;
  const execute = async () => { generations++; return Response.json({ proposals: { fr: { title: "Reviewed" } } }); };
  const first = await h.service.queueSuggestion(h.request(), "operator", "campaigns", execute);
  const repeat = await h.service.queueSuggestion(h.request(), "operator", "campaigns", execute);
  assert.equal((await first.json()).taskId, (await repeat.json()).taskId); assert.equal(h.callbacks.length, 1);
  assert.equal((await h.service.queueSuggestion(h.request({ revision: "changed", locale: "fr" }), "operator", "campaigns", execute)).status, 409);
  await h.callbacks[0](); await h.callbacks[0](); assert.equal(generations, 1);
});

test("cancelling a queued task prevents provider work, and worker failures expose no upstream details", async () => {
  const h = fixture(); let generations = 0;
  const first = await h.service.queueSuggestion(h.request(), "operator", "campaigns", async () => { generations++; throw new Error("private-key donor@example.test"); });
  const { taskId } = await first.json(); await h.service.cancelSuggestionTask(taskId, "operator"); await h.callbacks[0]();
  assert.equal(generations, 0); assert.equal((await h.service.suggestionTaskResponse((await h.service.readSuggestionTask(taskId, "operator"))!)).status, 410);
  await h.service.queueSuggestion(h.request(undefined, "22222222-2222-4222-8222-222222222222"), "operator", "campaigns", async () => { throw new Error("private-key donor@example.test"); });
  await h.callbacks[1](); assert.doesNotMatch(JSON.stringify([...h.tasks.values()]), /private-key|donor@/);
});

test("a missing worker reaches a controlled deadline without restarting or charging again", async () => {
  const h = fixture(); const queued = await h.service.queueSuggestion(h.request(), "operator", "campaigns", async () => Response.json({}));
  const { taskId } = await queued.json(); const row = h.tasks.get(taskId)!; row.deadlineAt = new Date(Date.now() - 1);
  const response = await h.service.suggestionTaskResponse((await h.service.readSuggestionTask(taskId, "operator"))!);
  assert.equal(response.status, 502); assert.equal((await response.json()).reason, "AI_TIMEOUT"); assert.equal(h.callbacks.length, 1);
  row.expiresAt = new Date(Date.now() - 1); assert.equal(await h.service.readSuggestionTask(taskId, "operator"), null);
});
