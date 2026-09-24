import "server-only";

import { getOpenAiProviderStatus } from "@/lib/ai/core/openai-provider";
import { LOCALES, isValidLocale } from "@/lib/locales";
import { LLM_VERDICT_JSON_SCHEMA, llmVerdictSchema, type LlmVerdict } from "./schema";
import type { CatalogCampaign, CatalogCategory } from "./recommend";

/**
 * The single model call the concierge makes, and only for free text: read the
 * visitor's message, pick from the candidates the server already chose, and
 * phrase the reply in their language. Uses the same provider switches as the
 * dashboard assistants (`lib/ai/core/openai-provider.ts`): without
 * `OPENAI_API_KEY` and `AI_CORE_ENABLE_EXTERNAL_CALLS=true` it returns null
 * and the deterministic path answers.
 *
 * The reply is forced into `LLM_VERDICT_JSON_SCHEMA` by the Responses API and
 * then re-validated with zod; ids outside the candidate list are dropped by
 * the caller. The model is never given prices to compute, donor details, or
 * anything from the database beyond the compact candidate lines below.
 */

const TIMEOUT_MS = 12_000;

export interface LlmInput {
  locale: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  candidates: CatalogCampaign[];
  categories: CatalogCategory[];
  /** What deterministic parsing already found; the model may only fill gaps. */
  parsed: { intent: string | null; amount: number | null; currency: string | null; frequency: string | null; region: string | null };
  currentCampaign: CatalogCampaign | null;
  waqf: Array<{ unit: string; priceUSD: number }>;
}

function languageName(locale: string): string {
  return isValidLocale(locale) ? `${LOCALES[locale].label} (${LOCALES[locale].nativeLabel})` : "Arabic";
}

function candidateLine(c: CatalogCampaign): string {
  const parts = [
    `id=${c.id}`,
    `title="${c.title}"`,
    c.regionLabel ? `region=${c.regionLabel}` : null,
    c.categorySlugs.length ? `tags=${c.categorySlugs.join("|")}` : null,
    c.supportsShares && c.sharePriceUSD ? `share_price_usd=${c.sharePriceUSD}` : null,
    c.goalUSD ? `goal_usd=${c.goalUSD} raised_usd=${Math.round(c.raisedUSD)}` : "open_ended=true",
    `summary="${c.summary.slice(0, 140)}"`,
  ].filter(Boolean);
  return `- ${parts.join(" ")}`;
}

export function buildPrompt(input: LlmInput): string {
  const lang = languageName(input.locale);
  const lines: string[] = [];
  lines.push(
    `You are the donation concierge of Minbar Al-Aqsa (منبر الأقصى), a Turkish public-benefit charity working in Palestine, Syria, Sudan, Africa and the Balkans.`,
    `Task: read the visitor's message, decide their intent, and choose which of the CANDIDATE projects to recommend. Reply ONLY with the JSON object described by the schema.`,
    `Rules:`,
    `- Write "message" and every "reasons" entry in ${lang}. Calm, respectful, concise (1–2 sentences), no emojis, never say you are an AI.`,
    `- Recommend at most 3 ids, only from CANDIDATES, best first. Do not invent projects, numbers, urgency, percentages or impact figures. If the candidates do not fit, return an empty list and ask ONE short clarifying question in "message".`,
    `- Each reason must be factual and based only on the candidate line (region, tags, summary, share price) and the visitor's stated wish.`,
    `- Do not ask for anything the visitor already stated (PARSED). Do not ask about budget if amount is known.`,
    `- Never give a religious ruling (fatwa). If the message asks whether something is permissible, what counts for zakat, etc., set needsRuling=true and say the assistant cannot rule on that and the organisation can be contacted.`,
    `- Zakat questions about HOW to give: intent=zakat. Waqf: intent=waqf (units: ${input.waqf.map((w) => `${w.unit} $${w.priceUSD}`).join(", ")}). Gifts in someone's name: intent=gift and fill giftRecipientName. Regular giving (daily/friday/monthly): intent=recurring and fill frequency.`,
    `- "amount" is the visitor's number as they said it and "currency" the ISO code they implied; leave null if unknown. Never convert currencies.`,
  );
  lines.push(`PARSED: ${JSON.stringify(input.parsed)}`);
  if (input.currentCampaign) lines.push(`CURRENT_PAGE_PROJECT: ${candidateLine(input.currentCampaign)}`);
  lines.push(`CANDIDATES:`);
  for (const c of input.candidates) lines.push(candidateLine(c));
  if (input.categories.length) lines.push(`CATEGORIES: ${input.categories.map((c) => `${c.slug}="${c.title}"(${c.projectCount})`).join(", ")}`);
  if (input.history.length) {
    lines.push(`RECENT_CONVERSATION:`);
    for (const h of input.history.slice(-6)) lines.push(`${h.role === "user" ? "Visitor" : "Assistant"}: ${h.text.slice(0, 300)}`);
  }
  lines.push(`VISITOR_MESSAGE: ${input.message.slice(0, 600)}`);
  return lines.join("\n");
}

export interface LlmOutcome {
  verdict: LlmVerdict | null;
  reason: "ok" | "disabled" | "http_error" | "invalid_output" | "timeout" | "network";
}

export async function askModel(input: LlmInput): Promise<LlmOutcome> {
  const status = getOpenAiProviderStatus();
  const apiKey = process.env.OPENAI_API_KEY;
  if (status.mode !== "ready" || !apiKey) return { verdict: null, reason: "disabled" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${status.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: status.model,
        input: buildPrompt(input),
        max_output_tokens: 600,
        temperature: 0.3,
        text: { format: { type: "json_schema", name: "concierge_verdict", strict: true, schema: LLM_VERDICT_JSON_SCHEMA } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("[concierge] model HTTP", response.status, await response.text().catch(() => ""));
      return { verdict: null, reason: "http_error" };
    }
    const json = (await response.json().catch(() => null)) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> } | null;
    const text = json?.output_text ?? json?.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { verdict: null, reason: "invalid_output" };
    }
    const result = llmVerdictSchema.safeParse(parsed);
    if (!result.success) return { verdict: null, reason: "invalid_output" };
    return { verdict: result.data, reason: "ok" };
  } catch (error) {
    return { verdict: null, reason: (error as { name?: string })?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
