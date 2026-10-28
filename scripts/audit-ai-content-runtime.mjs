/** Safe synthetic diagnosis. Default: configuration only, no provider calls.
 * Explicit generation check (up to two small billable provider calls, no site content):
 * node --import tsx scripts/audit-ai-content-runtime.mjs --check-generation
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function probeContentRuntime({ runtime, env = process.env, request = fetch, checkGeneration = false, builders, errors }) {
  const safeModel = value => typeof value === "string" && /^(?:gpt-|o[134](?:-|$))[a-zA-Z0-9._:-]{0,115}$/.test(value) ? value : "CUSTOM_MODEL_REDACTED";
  const models = builders.contentModels(env);
  /** @type {Record<string, {status: string, details?: import("../lib/ai/core/openai-response").OpenAiFailureDetails}>} */
  const stages = {};
  const report = { databaseWrites: 0, providerRequests: 0, connectionSource: runtime.source, enabled: runtime.enabled, status: "not_checked",
    models: { default: safeModel(runtime.model), research: safeModel(models.research), translation: safeModel(models.translation) }, stages };
  if (!checkGeneration) { report.status = "generation_not_requested"; return report; }
  if (!runtime.apiKey) { report.status = "AI_NOT_CONFIGURED"; return report; }
  const run = async (stage, payload) => {
    try {
      report.providerRequests++;
      const response = await request("https://api.openai.com/v1/responses", { method: "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: "Bearer " + runtime.apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, max_output_tokens: payload.max_output_tokens ?? 4096 }), signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw await errors.openAiFailure(response, stage);
      const body = await response.json();
      const text = errors.openAiResponseText(body); JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/, "").trim());
      if (stage === "WEB_RESEARCH" && !body.output?.some(item => item.type === "web_search_call" && item.status === "completed" && item.action?.sources?.length)) throw new errors.OpenAiResponseError("AI_OUTPUT_INVALID");
      report.stages[stage] = { status: "ready" }; return true;
    } catch (error) {
      report.stages[stage] = { status: error instanceof errors.OpenAiResponseError ? error.code : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "AI_TIMEOUT" : "AI_OUTPUT_INVALID",
        ...(error instanceof errors.OpenAiResponseError && error.details ? { details: error.details } : {}) }; return false;
    }
  };
  if (!await run("WEB_RESEARCH", builders.researchRequest('Find the official OpenAI documentation for Responses API web search. Return JSON only with title and url. This is a synthetic connection test.', env))) { report.status = "research_failed"; return report; }
  // Like an editor title, this prompt has no JSON keyword of its own. The shared
  // builder must provide it; adding it here would conceal a rejected live request.
  const translated = await run("TRANSLATION", builders.researchedTranslationRequest('Translate the Arabic title "مشروع تعليمي" into English. Return {"title":"..."}. This is a synthetic connection test.', env));
  report.status = translated ? "generation_ready" : "translation_failed"; return report;
}

async function main() {
  const cwd = process.cwd(), require = createRequire(resolve(cwd, "package.json"));
  require("@next/env").loadEnvConfig(cwd, false, { info() {}, error() {} });
  const load = async path => { const loaded = await import(pathToFileURL(resolve(cwd, path)).href); return loaded.default ?? loaded; };
  const { PrismaClient } = require("@prisma/client"); const prisma = new PrismaClient({ log: [] });
  try {
    const { AiConnectionConfig } = await load("lib/ai/core/connection-config.ts");
    const { createAiConnectionStore } = await load("lib/ai/core/connection-store-core.ts");
    const runtime = await new AiConnectionConfig(createAiConnectionStore(command => prisma.$runCommandRaw(command))).runtime("content");
    const report = await probeContentRuntime({ runtime, builders: await load("lib/ai/core/content-requests.ts"), errors: await load("lib/ai/core/openai-response.ts"), checkGeneration: process.argv.includes("--check-generation") });
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...report, environmentSource: "CLI plus Next production env files; PM2 environment is not read", syntheticInputOnly: true }, null, 2));
    if (process.argv.includes("--check-generation") && report.status !== "generation_ready") process.exitCode = 1;
  } catch { console.error(JSON.stringify({ status: "AI_SETTINGS_UNAVAILABLE", databaseWrites: 0 })); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
