import "server-only";

import { getOpenAiProviderStatus } from "@/lib/ai/core/openai-provider";
import { LOCALES, isValidLocale } from "@/lib/locales";
import { LLM_VERDICT_JSON_SCHEMA, llmVerdictSchema, type LlmVerdict } from "./schema";
import type { CatalogCampaign, CatalogCategory } from "./recommend";
import type { KnowledgePack } from "./knowledge";
import type { DonorContext } from "./donor";

/**
 * The single model call the concierge makes, and only for free text: read the
 * visitor's message, answer it from the site's own knowledge when it is a
 * question, pick from the candidates the server already chose when it is a
 * wish to give, and phrase everything in their language. Uses the same
 * provider switches as the dashboard assistants (`lib/ai/core/openai-provider.ts`):
 * without `OPENAI_API_KEY` and `AI_CORE_ENABLE_EXTERNAL_CALLS=true` it returns
 * null and the deterministic path answers.
 *
 * The reply is forced into `LLM_VERDICT_JSON_SCHEMA` by the Responses API and
 * then re-validated with zod; ids outside the candidate list are dropped by
 * the caller. The model is never given prices to compute, donor details, or
 * anything from the database beyond the compact lines below.
 */

const TIMEOUT_MS = 14_000;

export interface LlmInput {
  locale: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  candidates: CatalogCampaign[];
  categories: CatalogCategory[];
  /** What deterministic parsing already found; the model may only fill gaps. */
  parsed: { intent: string | null; amount: number | null; currency: string | null; frequency: string | null; region: string | null; recurringNudged: boolean; route: string | null };
  currentCampaign: CatalogCampaign | null;
  waqf: Array<{ unit: string; priceUSD: number }>;
  knowledge: KnowledgePack;
  /** The signed-in donor's own giving, or null for a visitor. */
  donor: DonorContext | null;
}

function donorLines(d: DonorContext): string[] {
  const out = [
    `Signed in as ${d.firstName || "a donor"} (member since ${d.memberSince}). Confirmed donations: ${d.totals.donations}, total about $${Math.round(d.totals.paidUSD)}.`,
  ];
  if (d.plans.length) {
    out.push(`Regular plans:`);
    for (const p of d.plans) out.push(`- plan ${p.id}: ${p.frequency.toLowerCase()} ${p.amount} ${p.currency}, status ${p.status}${p.nextBillingDate ? `, next charge ${p.nextBillingDate}` : ""}${p.lastBillingDate ? `, last charge ${p.lastBillingDate}` : ""}, for: ${p.items.join(", ") || "general"}`);
  }
  if (d.recent.length) {
    out.push(`Recent donations (newest first):`);
    for (const r of d.recent) out.push(`- donation ${r.id} on ${r.date}: ${r.amount} ${r.currency}, state=${r.state}${r.method ? `, method=${r.method}` : ""}${r.recurring ? ", part of a regular plan" : ""}, for: ${r.items.join(", ") || "general"}${r.documentsReady ? " (receipt and certificate available)" : ""}`);
  }
  return out;
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
  const k = input.knowledge;
  const lines: string[] = [];
  lines.push(
    `You are the giving concierge of Minbar Al-Aqsa (منبر الأقصى), a Turkish public-benefit foundation based in Istanbul working for Al-Quds, Gaza, Syria, Sudan, Africa and the Balkans. You help visitors decide how to give and answer their questions about the foundation and how donating works here.`,
    `Reply ONLY with the JSON object described by the schema. Write "answer", "message" and every "reasons" entry in ${lang}. Tone: calm, warm, respectful, concise, like a trusted member of the team. No emojis, never say you are an AI or a model, never invent.`,
    ``,
    `CHOOSE A MODE:`,
    `- "answer": the visitor asked something (about the foundation, payments, receipts, certificates, zakat, waqf, regular giving, where money goes, a greeting, a doubt, an objection). Put the reply in "answer" (2–5 sentences), leave recommendedIds empty. If a page helps, set "route".`,
    `- "recommend": the visitor wants to give and said what for. Put a one-sentence lead-in in "message", choose up to 3 ids from CANDIDATES (best first) with a factual reason each. "answer" may be empty.`,
    `- "answer_then_recommend": they asked something AND want to give — answer first in "answer", then lead-in + ids.`,
    ``,
    `GROUNDING: answer only from ORGANISATION, HOW_GIVING_WORKS, FAQ and CANDIDATES below. If the answer is not there, say honestly that you do not have that information and set needsHuman=true so they can reach the team (the contact page). Never invent numbers, percentages, urgency, dates, bank details, impact figures, or policies. Never give a religious ruling (fatwa): for "is it permissible / does it count / what is the ruling", set needsRuling=true and say the team can help through the contact page.`,
    ``,
    `CONVERSION, WITHOUT PRESSURE: your goal is that the visitor gives with confidence today. Remove doubts with facts (receipts, certificates, field follow-up, secure payment). When someone plans a one-time gift and RECURRING_NUDGED is false, add ONE calm sentence about regular giving (daily, every Friday, or monthly) as an option that keeps the impact going — never repeat it once RECURRING_NUDGED is true, never insist, never guilt-trip. Prefer concrete next steps over questions; ask at most one question and only when you truly cannot proceed. Do not ask for anything already in PARSED. Answer the message in front of you: do not bring up an amount, cause or place from earlier turns unless this message is about it, and if the visitor changes their mind (a new amount, a new cause), follow the new one without comment.`,
    `NEEDS_HUMAN: set needsHuman=true for complaints, payment or receipt problems, refund requests, partnership/media/press/volunteering enquiries, or anything you cannot answer from the knowledge. Still give the best short answer you can.`,
    `THE DONOR'S OWN GIVING: if DONOR is present the visitor IS signed in — never tell them to sign in or log in. You may answer questions about their donations, plans, receipts and certificates strictly from DONOR — states mean: paid = confirmed and documents ready; pending_confirmation = card payment not yet confirmed by the gateway; awaiting_receipt = bank transfer, the donor has not uploaded the receipt; under_review = receipt received, finance is matching it; rejected = the transfer could not be matched (they may upload again); failed = the payment did not go through. For "where is my receipt / certificate" you MUST set route=receipt (or thanksCertificate) and donationId to the id of the matching paid donation from DONOR, and say it is one tap away; for an unfinished bank transfer set route=paymentPending with its donationId; for plans, changes or cancellations set route=account. Use their first name naturally, once. If DONOR is absent and they ask about their own donation, say the details are on the Account page after signing in and that every confirmed donation is also emailed with its receipt; set route=account and intent=account. Never state amounts or dates that are not in DONOR.`,
    `INTENTS: zakat questions about HOW to give → intent=zakat. Waqf → intent=waqf. Gifts in someone's name → intent=gift and fill giftRecipientName. Regular giving → intent=recurring and fill frequency. "amount" is the number as the visitor said it and "currency" the ISO code they implied; leave null if unknown. Never convert currencies.`,
  );
  lines.push(``, `ORGANISATION:`, ...k.organisation.map((s) => `- ${s}`));
  lines.push(``, `HOW_GIVING_WORKS:`, ...k.giving.map((s) => `- ${s}`), `- Waqf units on offer: ${input.waqf.map((w) => `${w.unit} $${w.priceUSD}`).join(", ")}.`);
  if (k.faqs.length) {
    lines.push(``, `FAQ (published by the foundation):`);
    for (const f of k.faqs) lines.push(`Q: ${f.q}\nA: ${f.a}`);
  }
  if (input.donor) lines.push(``, `DONOR:`, ...donorLines(input.donor));
  else lines.push(``, `DONOR: not signed in`);
  lines.push(``, `PARSED: ${JSON.stringify(input.parsed)}`, `RECURRING_NUDGED: ${input.parsed.recurringNudged}`, `CURRENT_PAGE: ${input.parsed.route ?? "unknown"}`);
  if (input.currentCampaign) lines.push(`CURRENT_PAGE_PROJECT: ${candidateLine(input.currentCampaign)}`);
  lines.push(``, `CANDIDATES:`);
  for (const c of input.candidates) lines.push(candidateLine(c));
  if (input.categories.length) lines.push(`CATEGORIES: ${input.categories.map((c) => `${c.slug}="${c.title}"(${c.projectCount})`).join(", ")}`);
  if (input.history.length) {
    lines.push(``, `RECENT_CONVERSATION:`);
    for (const h of input.history.slice(-6)) lines.push(`${h.role === "user" ? "Visitor" : "Assistant"}: ${h.text.slice(0, 300)}`);
  }
  lines.push(``, `VISITOR_MESSAGE: ${input.message.slice(0, 600)}`);
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
        max_output_tokens: 900,
        temperature: 0.4,
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
