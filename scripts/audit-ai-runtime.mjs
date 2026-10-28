#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/** Reads the shared connection in CLI mode; no donor data, settings writes or messages. Generation is explicit opt-in. */
export async function auditAiRuntime(env, { checkGeneration = false, checkResearch = false, request = fetch } = {}) {
  const key = env.OPENAI_API_KEY?.trim();
  const externalCallsEnabled = env.AI_CORE_ENABLE_EXTERNAL_CALLS === "true";
  const base = (env.AI_CORE_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const configured = Boolean(key);
  const report = { configured, externalCallsEnabled, generationRequests: 0, databaseWrites: 0, settingsWrites: 0, analysis: { status: "not_checked" }, research: { status: "not_checked" } };
  if (!configured) { report.analysis.status = report.research.status = "key_missing"; return report; }
  if (base !== "https://api.openai.com/v1") { report.analysis.status = report.research.status = "custom_endpoint_not_probed"; return report; }
  const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  async function inspect(model, generate, search) {
    try {
      const metadata = await request(`${base}/models/${encodeURIComponent(model)}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!metadata.ok) return { model, status: "model_access_failed", httpStatus: metadata.status };
      if (!generate) return { model, status: "model_access_ready_generation_not_tested", httpStatus: metadata.status };
      report.generationRequests++;
      const response = await request(`${base}/responses`, { method: "POST", headers, signal: AbortSignal.timeout(90000), body: JSON.stringify({
        model, max_output_tokens: search ? 1500 : 64,
        ...(search ? { tools: [{ type: "web_search", search_context_size: "medium" }], tool_choice: "required", include: ["web_search_call.action.sources"] } : { text: { format: { type: "json_object" } } }),
        input: search ? 'Search for the official United Nations homepage. Return valid JSON only: {"url":"official homepage URL"}.' : 'Return JSON only: {"ok":true}',
        store: false,
      }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        // Only allowlisted machine codes, never provider messages or request content.
        const known = new Set(["insufficient_quota", "model_not_found", "invalid_api_key", "rate_limit_exceeded", "unsupported_parameter", "unsupported_value", "invalid_request_error"]);
        const errorCode = known.has(body?.error?.code) ? body.error.code : "provider_rejected";
        return { model, status: "generation_failed", httpStatus: response.status, errorCode };
      }
      if (body?.status === "incomplete" || body?.status === "failed") return { model, status: "generation_incomplete", httpStatus: response.status };
      const blocks = (body?.output ?? []).flatMap(row => row.content ?? []);
      const text = body?.output_text || blocks.filter(row => row.type === "output_text").map(row => row.text || "").join("");
      if (search) {
        const completed = body?.output?.some(row => row.type === "web_search_call" && row.status === "completed");
        const sources = (body?.output ?? []).flatMap(row => row.action?.sources ?? []);
        const annotations = blocks.flatMap(row => row.annotations ?? []);
        const cited = [...sources, ...annotations].some(row => typeof row.url === "string" && /^https?:\/\//.test(row.url));
        let validJson = false;
        try { const result = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()); validJson = typeof result?.url === "string" && /^https?:\/\//.test(result.url); } catch { /* Report readiness only for the actual research JSON contract. */ }
        return { model, status: completed && cited && validJson ? "research_ready" : "research_not_completed", httpStatus: response.status };
      }
      let valid = false; try { valid = JSON.parse(text)?.ok === true; } catch {}
      return { model, status: valid ? "generation_ready" : "invalid_generation_output", httpStatus: response.status };
    } catch { return { model, status: "network_or_timeout" }; }
  }
  report.analysis = externalCallsEnabled ? await inspect(env.AI_CORE_OPENAI_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini", checkGeneration, false) : { status: "external_calls_disabled" };
  report.research = await inspect(env.EDITORIAL_RESEARCH_MODEL || env.SEO_RESEARCH_MODEL || "gpt-5.5", checkResearch, true);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nextEnv = await import("@next/env");
  const { loadEnvConfig } = nextEnv.default ?? nextEnv;
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const { require: tsxRequire } = await import("tsx/cjs/api");
  const { AiConnectionConfig } = tsxRequire("../lib/ai/core/connection-config.ts", import.meta.url);
  const { createAiConnectionStore } = tsxRequire("../lib/ai/core/connection-store-core.ts", import.meta.url);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ log: [] });
  try {
  const connection = new AiConnectionConfig(process.env.DATABASE_URL ? createAiConnectionStore(command => prisma.$runCommandRaw(command)) : { read: async () => null, replace: async () => false });
  const [core, content] = await Promise.all([connection.runtime(), connection.runtime("content")]);
  const effectiveEnv = { ...process.env, OPENAI_API_KEY: content.apiKey || "", AI_CORE_ENABLE_EXTERNAL_CALLS: String(core.enabled), AI_CORE_OPENAI_MODEL: core.model, AI_CORE_OPENAI_BASE_URL: core.baseUrl };
  const report = await auditAiRuntime(effectiveEnv, { checkGeneration: process.argv.includes("--check-generation"), checkResearch: process.argv.includes("--check-research") });
  console.log(JSON.stringify({ ...report, connectionSource: core.source }, null, 2));
  } catch { console.log(JSON.stringify({ configured: false, connectionError: "AI_SETTINGS_UNAVAILABLE", generationRequests: 0, databaseWrites: 0, settingsWrites: 0 })); }
  finally { await prisma.$disconnect(); }
}
