import test from "node:test";
import assert from "node:assert/strict";
import { probeContentRuntime } from "../../scripts/audit-ai-content-runtime.mjs";
import * as builders from "../../lib/ai/core/content-requests";
import * as errors from "../../lib/ai/core/openai-response";
const runtime = { apiKey: "fixture-key-never-print", enabled: true, model: "gpt-4o-mini", source: "DATABASE" };

test("the runtime diagnostic makes no provider call unless generation is explicitly requested", async () => {
  const result = await probeContentRuntime({ runtime, env: { NODE_ENV: "test" }, builders, errors, request: async () => { throw new Error("No provider call expected"); } });
  assert.equal(result.providerRequests, 0); assert.equal(result.status, "generation_not_requested");
  assert.equal(result.models.research, "gpt-5.5"); assert.doesNotMatch(JSON.stringify(result), /fixture-key/);
});
test("a rejected real research contract reports the exact safe category and never tries translation", async () => {
  const result = await probeContentRuntime({ runtime, env: { NODE_ENV: "test" }, builders, errors, checkGeneration: true, request: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); assert.equal(body.tool_choice, "required"); assert.equal(body.text, undefined);
    return Response.json({ error: { code: "unsupported_parameter", param: "tools", message: "private-key donor@example.test" } }, { status: 400 });
  } });
  assert.equal(result.providerRequests, 1); assert.equal(result.status, "research_failed");
  assert.equal(result.stages.WEB_RESEARCH.details?.field, "SEARCH_TOOL"); assert.doesNotMatch(JSON.stringify(result), /private-key|donor@|fixture-key/);
});
test("successful research and translation probes do not publish generated content or expose it", async () => {
  let count = 0;
  const result = await probeContentRuntime({ runtime, env: { NODE_ENV: "test" }, builders, errors, checkGeneration: true, request: async (_url, init) => {
    count++; const body = JSON.parse(String(init?.body)); assert.equal(body.store, false);
    return Response.json({ status: "completed", output: [
      ...(count === 1 ? [{ type: "web_search_call", status: "completed", action: { sources: [{ url: "https://example.test/docs" }] } }] : []),
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({ title: "Synthetic unpublished content" }) }] },
    ] });
  } });
  assert.equal(result.providerRequests, 2); assert.equal(result.status, "generation_ready"); assert.equal(result.databaseWrites, 0);
  assert.doesNotMatch(JSON.stringify(result), /Synthetic unpublished content|fixture-key/);
});

test("the mini fallback uses a supported live output limit, and the diagnostic exercises that exact limit", async () => {
  for (const model of ["gpt-4o-mini", "gpt-4o-mini-2024-07-18", "ft:gpt-4o-mini-2024-07-18:fixture:translation"]) {
    const env = { NODE_ENV: "test" as const, CONTENT_LOCALIZATION_MODEL: model };
    const production = builders.researchedTranslationRequest("Synthetic draft", env);
    let calls = 0;
    const result = await probeContentRuntime({ runtime, env, builders, errors, checkGeneration: true, request: async (_url, init) => {
      calls++; const body = JSON.parse(String(init?.body));
      if (calls === 2) {
        assert.equal(body.max_output_tokens, production.max_output_tokens, "a smaller diagnostic override would hide a rejected live request");
        if (body.max_output_tokens > 16_384) return Response.json({ error: { code: "invalid_value", param: "max_output_tokens" } }, { status: 400 });
      }
      return Response.json({ status: "completed", output: [
        ...(calls === 1 ? [{ type: "web_search_call", status: "completed", action: { sources: [{ url: "https://example.test/docs" }] } }] : []),
        { type: "message", content: [{ type: "output_text", text: JSON.stringify({ title: "Synthetic result" }) }] },
      ] });
    } });
    assert.equal(result.status, "generation_ready"); assert.equal(production.model, model);
  }
});
