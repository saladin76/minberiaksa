import "server-only";

import { prisma } from "@/lib/prisma";
import { getOpenAiProviderStatus } from "@/lib/ai/core/openai-provider";
import { loadCatalog } from "./catalog";
import type { ConciergeRange } from "./analytics";
import { conversationWhere, donationsBySession, needsDonationLookup, type ConversationFilters } from "./conversations";

/**
 * "Read all these conversations and tell us what to improve" — the insights
 * page's engine. Gathers the filtered transcripts into a compact corpus, adds
 * the live campaign catalog (so "people ask for X and we have no X" can be
 * judged), and asks the model for a structured conclusion in Arabic.
 *
 * Without the model (no key, external calls off, or a failure) a counting-only
 * reading is returned instead, in the same shape, marked `mode: "basic"`.
 */

const MAX_CONVERSATIONS = 400;
const MAX_CORPUS_CHARS = 110_000;
const TIMEOUT_MS = 100_000;

export interface InsightResult {
  summary: string;
  highlights: string[];
  missingCampaigns: Array<{ topic: string; mentions: number; evidence: string; suggestion: string }>;
  frequentQuestions: Array<{ question: string; mentions: number; answered: "yes" | "partly" | "no"; suggestedAnswer: string }>;
  issues: Array<{ title: string; detail: string; severity: "high" | "medium" | "low"; mentions: number; examples: string[] }>;
  conversionBlockers: Array<{ title: string; detail: string }>;
  contentGaps: Array<{ title: string; detail: string }>;
  assistantQuality: { score: number; strengths: string[]; weaknesses: string[] };
  sentiment: { positive: number; neutral: number; negative: number };
  recommendations: Array<{ title: string; detail: string; priority: "high" | "medium" | "low"; area: "campaigns" | "content" | "ux" | "payments" | "assistant" | "support" | "other" }>;
  teamNotesSuggestion: string;
}

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items: unknown) => ({ type: "array", items });

const INSIGHT_JSON_SCHEMA = obj({
  summary: str,
  highlights: arr(str),
  missingCampaigns: arr(obj({ topic: str, mentions: int, evidence: str, suggestion: str })),
  frequentQuestions: arr(obj({ question: str, mentions: int, answered: { type: "string", enum: ["yes", "partly", "no"] }, suggestedAnswer: str })),
  issues: arr(obj({ title: str, detail: str, severity: { type: "string", enum: ["high", "medium", "low"] }, mentions: int, examples: arr(str) })),
  conversionBlockers: arr(obj({ title: str, detail: str })),
  contentGaps: arr(obj({ title: str, detail: str })),
  assistantQuality: obj({ score: int, strengths: arr(str), weaknesses: arr(str) }),
  sentiment: obj({ positive: int, neutral: int, negative: int }),
  recommendations: arr(obj({ title: str, detail: str, priority: { type: "string", enum: ["high", "medium", "low"] }, area: { type: "string", enum: ["campaigns", "content", "ux", "payments", "assistant", "support", "other"] } })),
  teamNotesSuggestion: str,
});

type ConvRow = {
  sessionId: string;
  locale: string;
  intents: string[];
  needsHuman: boolean;
  fallbackCount: number;
  userId: string | null;
  startedAt: Date;
  turns: Array<{ role: string; kind: string; text: string }>;
};

export async function gatherInsightCorpus(range: ConciergeRange, filters: ConversationFilters, windowDays: number) {
  const bySession = await donationsBySession(range, windowDays);
  const where = conversationWhere(range, filters, needsDonationLookup(filters) ? bySession : null);
  const [total, rows] = await Promise.all([
    prisma.aiConciergeConversation.count({ where }),
    prisma.aiConciergeConversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: MAX_CONVERSATIONS,
      select: { sessionId: true, locale: true, intents: true, needsHuman: true, fallbackCount: true, userId: true, startedAt: true, turns: { select: { role: true, kind: true, text: true } } },
    }),
  ]);

  /* Conversations where the visitor actually said something carry the signal;
     greeting-only sessions are counted but not sent. */
  const lines: string[] = [];
  let used = 0;
  let messageCount = 0;
  for (const [i, c] of (rows as ConvRow[]).entries()) {
    const said = c.turns.filter((t) => t.role === "user");
    if (!said.length) continue;
    const donated = bySession.get(c.sessionId);
    const tags = [c.locale, c.intents.join("|") || "-", donated ? (donated.some((d) => d.kind === "direct") ? "donated:direct" : "donated:indirect") : "no-donation", c.needsHuman ? "flag:needs-human" : "", c.fallbackCount ? `fallback:${c.fallbackCount}` : "", c.userId ? "signed-in" : "visitor"].filter(Boolean);
    const body = c.turns
      .slice(0, 24)
      .map((t) => (t.role === "user" ? `V${t.kind === "message" ? "" : `(${t.kind})`}: ${t.text.slice(0, 300)}` : `A: ${t.text.slice(0, 180)}`))
      .join("\n");
    const block = `#${i + 1} [${tags.join(" ")}]\n${body}`;
    if (used + block.length > MAX_CORPUS_CHARS) break;
    lines.push(block);
    used += block.length;
    messageCount += said.filter((t) => t.kind === "message").length;
  }
  return { total, read: rows.length, sent: lines.length, messageCount, corpus: lines.join("\n\n"), rows: rows as ConvRow[], bySession };
}

function buildInsightPrompt(corpus: string, catalogLines: string[], meta: { from: string; to: string; total: number; sent: number }): string {
  return [
    `You analyse conversations between visitors and the giving assistant ("مساعد العطاء") of Minbar Al-Aqsa, a Turkish charity foundation (Al-Quds, Gaza, Syria, Sudan, Africa, the Balkans). The team wants to improve the website and the assistant from what visitors actually ask.`,
    `Write EVERYTHING in Modern Standard Arabic, concise and concrete. Reply only with the JSON object of the schema.`,
    ``,
    `Period: ${meta.from} → ${meta.to}. Conversations in the filter: ${meta.total}; transcripts below: ${meta.sent}.`,
    `Transcript format: "#n [locale intents outcome flags]" then lines — "V:" is the visitor (V(step) = a button they tapped, V(added) = added a donation to the basket), "A:" is the assistant (truncated). donated:direct = the basket went through the assistant; donated:indirect = they gave later; flag:needs-human = the assistant could not fully answer; fallback = the AI model did not answer and the rule-based path did.`,
    ``,
    `What to produce:`,
    `- summary: 4–7 sentences for the management — what visitors come for, how well the assistant serves them, the biggest opportunity.`,
    `- highlights: 3–6 short headline findings.`,
    `- missingCampaigns: causes, places or project types visitors ASK FOR that are NOT in the CATALOG below (or exist but are hard to find). mentions = how many conversations; evidence = one short real quote (translate to Arabic if needed); suggestion = what campaign or page to add. Only real gaps — never list something the catalog already covers well.`,
    `- frequentQuestions: the most repeated questions (up to 10), whether the assistant answered them (yes/partly/no), and a suggested answer the team could publish as an FAQ.`,
    `- issues: problems and complaints (payment failures, receipts, refunds, bugs, confusion, trust concerns), with severity and 1–2 short example quotes each.`,
    `- conversionBlockers: why interested visitors did not give (from no-donation conversations).`,
    `- contentGaps: information missing from the site or the assistant's knowledge.`,
    `- assistantQuality: score 1–10 with strengths and weaknesses of the assistant's answers.`,
    `- sentiment: percentages of positive/neutral/negative visitor tone, summing to 100.`,
    `- recommendations: 5–10 prioritised, actionable changes (area: campaigns, content, ux, payments, assistant, support, other).`,
    `- teamNotesSuggestion: short lines (facts or guidance, one per line) the team could paste into the assistant's TEAM NOTES so it answers the recurring gaps better. Only facts that the transcripts show are needed; leave placeholders like [الرقم] where the team must fill a fact you do not know. Never invent facts.`,
    `Base every claim on the transcripts; counts are approximate but must not be invented. Empty arrays are fine when nothing applies. Ignore test messages.`,
    ``,
    `CATALOG (published projects, then areas):`,
    ...catalogLines,
    ``,
    `TRANSCRIPTS:`,
    corpus,
  ].join("\n");
}

async function catalogLines(): Promise<string[]> {
  try {
    const catalog = await loadCatalog("ar");
    const lines = catalog.campaigns.slice(0, 150).map((c) => `- ${c.title}${c.regionLabel ? ` (${c.regionLabel})` : ""}`);
    lines.push(`AREAS: ${catalog.categories.map((c) => `${c.title}(${c.projectCount})`).join("، ")}`);
    return lines;
  } catch {
    return ["(catalog unavailable)"];
  }
}

export async function askInsightModel(prompt: string): Promise<{ result: InsightResult | null; model: string | null; error: string | null }> {
  const status = getOpenAiProviderStatus();
  const apiKey = process.env.OPENAI_API_KEY;
  if (status.mode !== "ready" || !apiKey) return { result: null, model: null, error: status.reason };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${status.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: status.model,
        input: prompt,
        max_output_tokens: 6000,
        temperature: 0.3,
        text: { format: { type: "json_schema", name: "concierge_insights", strict: true, schema: INSIGHT_JSON_SCHEMA } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("[concierge insights] model HTTP", response.status, await response.text().catch(() => ""));
      return { result: null, model: status.model, error: `OpenAI HTTP ${response.status}` };
    }
    const json = (await response.json().catch(() => null)) as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> } | null;
    const text = json?.output_text ?? json?.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? "";
    const parsed = JSON.parse(text) as InsightResult;
    if (!parsed || typeof parsed.summary !== "string") return { result: null, model: status.model, error: "invalid output" };
    return { result: parsed, model: status.model, error: null };
  } catch (error) {
    const aborted = (error as { name?: string })?.name === "AbortError";
    return { result: null, model: status.model, error: aborted ? "timeout" : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** Counting only: repeated questions, intents, flagged conversations. */
function basicReading(g: Awaited<ReturnType<typeof gatherInsightCorpus>>): InsightResult {
  const norm = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[؟?!.,،]+/g, "").replace(/\s+/g, " ").trim();
  const asked = new Map<string, { text: string; n: number }>();
  const intents = new Map<string, number>();
  const flagged: string[] = [];
  let donated = 0;
  for (const c of g.rows) {
    for (const i of c.intents) intents.set(i, (intents.get(i) ?? 0) + 1);
    if (g.bySession.has(c.sessionId)) donated += 1;
    const said = c.turns.filter((t) => t.role === "user" && t.kind === "message");
    for (const t of said) {
      const k = norm(t.text);
      if (k.length < 3) continue;
      const cur = asked.get(k) ?? { text: t.text, n: 0 };
      cur.n += 1;
      asked.set(k, cur);
    }
    if (c.needsHuman && said[0]) flagged.push(said[0].text.slice(0, 160));
  }
  const top = [...asked.values()].sort((a, b) => b.n - a.n).slice(0, 10);
  const topIntents = [...intents.entries()].sort((a, b) => b[1] - a[1]);
  const withText = g.rows.filter((c) => c.turns.some((t) => t.role === "user" && t.kind === "message")).length;
  return {
    summary: `قراءة إحصائية بدون نموذج الذكاء الاصطناعي: ${g.total} محادثة في الفترة، ${withText} منها كتب فيها الزائر رسالة، و${donated} ارتبطت بتبرع. أكثر النوايا: ${topIntents.slice(0, 3).map(([k, v]) => `${k} (${v})`).join("، ") || "—"}. ${flagged.length} محادثة احتاجت تدخل الفريق. فعّل مزوّد OpenAI للحصول على استنتاج كامل.`,
    highlights: topIntents.slice(0, 5).map(([k, v]) => `${k}: ${v} محادثة`),
    missingCampaigns: [],
    frequentQuestions: top.map((q) => ({ question: q.text.slice(0, 200), mentions: q.n, answered: "partly" as const, suggestedAnswer: "" })),
    issues: flagged.slice(0, 8).map((f) => ({ title: "محادثة تحتاج متابعة", detail: f, severity: "medium" as const, mentions: 1, examples: [f] })),
    conversionBlockers: [],
    contentGaps: [],
    assistantQuality: { score: 0, strengths: [], weaknesses: [] },
    sentiment: { positive: 0, neutral: 100, negative: 0 },
    recommendations: [],
    teamNotesSuggestion: "",
  };
}

export async function runConciergeInsight(opts: {
  range: ConciergeRange;
  filters: ConversationFilters;
  windowDays: number;
  createdBy: { id: string | null; name: string | null };
}) {
  const g = await gatherInsightCorpus(opts.range, opts.filters, opts.windowDays);
  let mode: "llm" | "basic" = "basic";
  let model: string | null = null;
  let error: string | null = null;
  let result: InsightResult;
  if (g.sent === 0) {
    result = basicReading(g);
    error = "no transcripts with visitor messages in this filter";
  } else {
    const prompt = buildInsightPrompt(g.corpus, await catalogLines(), { from: opts.range.startKey, to: opts.range.endKey, total: g.total, sent: g.sent });
    const outcome = await askInsightModel(prompt);
    model = outcome.model;
    error = outcome.error;
    if (outcome.result) {
      result = outcome.result;
      mode = "llm";
    } else {
      result = basicReading(g);
    }
  }
  const saved = await prisma.aiConciergeInsight.create({
    data: {
      createdById: opts.createdBy.id,
      createdByName: opts.createdBy.name,
      from: opts.range.from,
      to: opts.range.to,
      filters: { ...opts.filters, startKey: opts.range.startKey, endKey: opts.range.endKey },
      conversationCount: g.total,
      messageCount: g.messageCount,
      mode,
      model,
      result: result as object,
    },
  });
  return { insight: saved, error, read: g.sent, total: g.total };
}
