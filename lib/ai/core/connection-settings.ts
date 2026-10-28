import { AiConnectionConfig } from "./connection-config";

export async function getAiConnectionConfig() {
  const store = process.env.DATABASE_URL ? (await import("./connection-store")).aiConnectionStore : { read: async () => null, replace: async () => false };
  return new AiConnectionConfig(store);
}

/** Server callers get the effective key; dashboard clients only receive snapshot(). */
export async function getOpenAiRuntime(purpose: "core" | "content" = "core") {
  try { return await (await getAiConnectionConfig()).runtime(purpose); }
  catch { return { apiKey: null, configured: false, enabled: false, model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", source: "NONE" as const, error: "AI_SETTINGS_UNAVAILABLE" }; }
}
