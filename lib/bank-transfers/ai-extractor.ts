import "server-only";
import type { ParsedBankTransferRow } from "./statement-parser";

/**
 * AI extraction layer for bank statements. Turkish incoming-transfer descriptions are messy and vary
 * by bank/format (embedded sender names, free-text purposes, SN/FastRef noise). This uses OpenAI to
 * pull a CLEAN donor name + a short purpose/project from each row's description.
 *
 * SAFETY:
 * - Optional + fail-safe: if OpenAI isn't configured (`OPENAI_API_KEY` + `AI_CORE_ENABLE_EXTERNAL_CALLS
 *   =true`) or the call fails/times out, this returns null and the caller falls back to the existing
 *   heuristic enhancer. Nothing breaks.
 * - AI only refines the donor NAME + purpose text. It never sets amounts, dates, or direction — those
 *   stay deterministic from the parsed numeric columns, so no figure can be hallucinated.
 */

export type AiRowEnhancement = { donorName: string | null; project: string | null; note: string | null };

const TIMEOUT_MS = 25_000;
const MAX_ROWS = 200;

function aiReady(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.AI_CORE_ENABLE_EXTERNAL_CALLS === "true";
}
function model(): string {
  return process.env.AI_CORE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
}
function baseUrl(): string {
  return (process.env.AI_CORE_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
}

const SYSTEM_PROMPT = [
  "You extract charity donation info from Turkish bank-statement transfer lines.",
  "For each item you receive an index (i) and a raw description (plus amount/currency/date for context).",
  "Return STRICT JSON: {\"items\":[{\"i\":number,\"donorName\":string|null,\"project\":string|null,\"note\":string|null}]}.",
  "donorName = the individual or organization who SENT the money, cleaned of bank names (Ziraat, Kuveyt Türk, Albaraka, Garanti, Vakıf, etc.), and of noise like 'Gelen FAST', 'SN:', 'GönBanka', 'FastRef', 'Açıklama', 'Hesaptan Havale'. Keep the human/org name only. null if none.",
  "note = the short free-text purpose the sender wrote, in its ORIGINAL language (e.g. 'Gazze yardım', 'filistin', 'Sadaka', 'zekat'), or null.",
  "project = one Arabic category label chosen from: 'زكاة','فلسطين / غزة','الأضاحي / القربان','كفالة الأيتام','إطعام / وجبات','المشاريع الطبية','تبرع عام'. Use null if unclear.",
  "Do NOT invent names or amounts. Only use what is present in the text.",
].join(" ");

/**
 * Enhance parsed rows with AI. Returns a map keyed by transactionHash, or null when AI is unavailable
 * or the call fails (caller then uses the heuristic enhancer).
 */
export async function aiEnhanceBankRows(rows: ParsedBankTransferRow[]): Promise<Map<string, AiRowEnhancement> | null> {
  if (!aiReady() || rows.length === 0) return null;

  const slice = rows.slice(0, MAX_ROWS);
  const items = slice.map((r, i) => ({
    i,
    description: `${r.description} ${r.raw.join(" ")}`.replace(/\s+/g, " ").trim().slice(0, 400),
    amount: r.amount,
    currency: r.currency,
    date: r.transactionDate,
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model(),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ items }) },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { items?: { i: number; donorName?: string | null; project?: string | null; note?: string | null }[] };
    if (!Array.isArray(parsed.items)) return null;

    const map = new Map<string, AiRowEnhancement>();
    for (const item of parsed.items) {
      const row = slice[item.i];
      if (!row) continue;
      const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 160) : null);
      map.set(row.transactionHash, { donorName: clean(item.donorName), project: clean(item.project), note: clean(item.note) });
    }
    return map.size ? map : null;
  } catch {
    return null; // aborted / network / parse error → safe fallback to heuristics
  } finally {
    clearTimeout(timer);
  }
}

/** Apply an AI enhancement map onto heuristically-enhanced rows (AI donor/project win when present). */
export function applyAiEnhancements(
  rows: ParsedBankTransferRow[],
  ai: Map<string, AiRowEnhancement>
): { rows: ParsedBankTransferRow[]; notesByHash: Map<string, string> } {
  const notesByHash = new Map<string, string>();
  const out = rows.map((row) => {
    const hit = ai.get(row.transactionHash);
    if (!hit) return row;
    if (hit.note) notesByHash.set(row.transactionHash, hit.note);
    return {
      ...row,
      donorName: hit.donorName || row.donorName,
      suggestedProject: hit.project || row.suggestedProject,
      confidence: (hit.donorName || hit.project) ? ("HIGH" as const) : row.confidence,
    } satisfies ParsedBankTransferRow;
  });
  return { rows: out, notesByHash };
}
