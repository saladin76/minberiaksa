import { randomUUID } from "node:crypto";
import { decryptIntegrationSecret, encryptIntegrationSecret, integrationEncryptionKeyIsConfigured } from "../../integration-settings/crypto";
import { openAiFailure } from "./openai-response";

export const OPENAI_URL = "https://api.openai.com/v1";
const SECRET_CONTEXT = "site-ai-connection:openai-api-key";
const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;
export type AiConnectionRecord = { revision: string; encryptedKey: string | null; enabled: boolean; model: string; updatedAt: string };
export type AiConnectionStore = { read(): Promise<AiConnectionRecord | null>; replace(expected: string | null, value: AiConnectionRecord): Promise<boolean> };
export type AiConnectionSnapshot = { revision: string | null; source: "DATABASE" | "ENVIRONMENT" | "NONE"; keyPresent: boolean; enabled: boolean; model: string; updatedAt: string | null; canSave: boolean };
export class AiConnectionError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export class AiConnectionConfig {
  constructor(private store: AiConnectionStore, private env: NodeJS.ProcessEnv = process.env) {}
  private async current() {
    const row = await this.store.read();
    if (row) {
      if (!MODEL.test(row.model) || typeof row.enabled !== "boolean" || !row.revision || !Number.isFinite(Date.parse(row.updatedAt))) throw new AiConnectionError("AI_SETTINGS_UNAVAILABLE", 503);
      let key: string | null = null;
      if (row.encryptedKey) {
        try { key = decryptIntegrationSecret(row.encryptedKey, SECRET_CONTEXT, this.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY); }
        catch { throw new AiConnectionError("AI_KEY_UNREADABLE", 503); }
      }
      return { row, key, enabled: row.enabled, model: row.model, source: "DATABASE" as const };
    }
    const key = this.env.OPENAI_API_KEY?.trim() || null;
    const model = this.env.AI_CORE_OPENAI_MODEL || this.env.OPENAI_MODEL || "gpt-4.1-mini";
    return { row: null, key, enabled: this.env.AI_CORE_ENABLE_EXTERNAL_CALLS === "true", model, source: key ? "ENVIRONMENT" as const : "NONE" as const };
  }
  async snapshot(): Promise<AiConnectionSnapshot> {
    const current = await this.current();
    return { revision: current.row?.revision ?? null, source: current.source, keyPresent: Boolean(current.key), enabled: current.enabled, model: current.model, updatedAt: current.row?.updatedAt ?? null, canSave: Boolean(this.env.DATABASE_URL) && integrationEncryptionKeyIsConfigured(this.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY) };
  }
  async runtime(purpose: "core" | "content" = "core") {
    const current = await this.current();
    // Legacy content tools predate the core switch. A manual connection owns the switch for every tool.
    const enabled = current.source !== "DATABASE" && purpose === "content" ? Boolean(current.key) : current.enabled;
    return { apiKey: enabled ? current.key : null, configured: Boolean(current.key), enabled, model: current.model, source: current.source, baseUrl: current.source === "DATABASE" ? OPENAI_URL : (this.env.AI_CORE_OPENAI_BASE_URL || OPENAI_URL).replace(/\/+$/, ""), error: null as string | null };
  }
  async save(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AiConnectionError("AI_SETTINGS_INVALID");
    const body = input as Record<string, unknown>;
    if (!(body.revision === null || typeof body.revision === "string" && /^[a-f0-9-]{36}$/.test(body.revision)) || typeof body.enabled !== "boolean" || typeof body.model !== "string" || !MODEL.test(body.model.trim()) || body.clearKey !== undefined && typeof body.clearKey !== "boolean") throw new AiConnectionError("AI_SETTINGS_INVALID");
    const key = this.inputKey(body.apiKey);
    if (body.clearKey && (key || body.enabled)) throw new AiConnectionError("AI_CLEAR_KEY_REQUIRES_DISABLED");
    if (!this.env.DATABASE_URL || !integrationEncryptionKeyIsConfigured(this.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY)) throw new AiConnectionError("AI_ENCRYPTION_NOT_CONFIGURED", 503);
    const current = await this.current();
    if ((current.row?.revision ?? null) !== body.revision) throw new AiConnectionError("AI_SETTINGS_CONFLICT", 409);
    const nextKey = body.clearKey ? null : key || current.key;
    if (body.enabled && !nextKey) throw new AiConnectionError("AI_KEY_REQUIRED");
    const next: AiConnectionRecord = { revision: randomUUID(), model: body.model.trim(), enabled: body.enabled, encryptedKey: nextKey ? encryptIntegrationSecret(nextKey, SECRET_CONTEXT, this.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY) : null, updatedAt: new Date().toISOString() };
    if (!await this.store.replace(body.revision as string | null, next)) throw new AiConnectionError("AI_SETTINGS_CONFLICT", 409);
    return this.snapshot();
  }
  private inputKey(value: unknown) {
    if (value === undefined || value === "") return null;
    if (typeof value !== "string") throw new AiConnectionError("AI_KEY_INVALID");
    const key = value.trim();
    if (!key) return null;
    if (!/^sk-[A-Za-z0-9_-]{17,509}$/.test(key)) throw new AiConnectionError("AI_KEY_INVALID");
    return key;
  }
  async test(input: unknown, fetcher: typeof fetch = fetch) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AiConnectionError("AI_SETTINGS_INVALID");
    const body = input as Record<string, unknown>;
    const current = await this.current();
    const key = this.inputKey(body.apiKey) || current.key;
    const model = body.model === undefined ? current.model : body.model;
    if (!key) throw new AiConnectionError("AI_KEY_REQUIRED");
    if (typeof model !== "string" || !MODEL.test(model.trim())) throw new AiConnectionError("AI_SETTINGS_INVALID");
    // Metadata only: no prompt, donor data, generation, persistence or configurable destination.
    try {
      const response = await fetcher(`${OPENAI_URL}/models/${encodeURIComponent(model.trim())}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store" });
      if (!response.ok) { const error = await openAiFailure(response); throw new AiConnectionError(error.code, 502); }
      const result = await response.json();
      if (result?.id !== model.trim() || result?.object !== "model") throw new AiConnectionError("AI_PROVIDER_UNAVAILABLE", 502);
      return { model: model.trim(), checkedAt: new Date().toISOString(), check: "MODEL_ACCESS", generationRequests: 0, saved: false };
    } catch (error) {
      if (error instanceof AiConnectionError) throw error;
      throw new AiConnectionError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "AI_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE", 502);
    }
  }
}
