import { SUPPORTED_LOCALES, isValidLocale, type SupportedLocale } from "@/lib/locales";

/**
 * Machine translation for the dashboard forms  Arabic master copy in, one
 * translation per requested locale out.
 *
 * Grew out of `app/api/admin/content-localization/preview/route.ts`, which
 * translates whole sections after the fact and knew seven languages. The
 * forms need the same thing at authoring time, for every field they carry,
 * in all eighteen non-Arabic locales, so the model call lives here and both
 * paths can share it.
 *
 * Two shapes of field:
 *  - plain strings (`fields`), translated as a JSON object of the same keys;
 *  - Tiptap documents (`richFields`), which must keep their structure. The
 *    text nodes are lifted out into a numbered list, the list is translated,
 *    and the translations are written back into the very same nodes. The
 *    model never sees the document tree, so it cannot damage it, and a reply
 *    with the wrong number of entries is rejected rather than misaligned.
 *
 * Every call carries the same instruction: preserve facts, numbers, names,
 * URLs, placeholders and currency; never invent. Temperature is low and the
 * response is forced to JSON.
 */

export const TRANSLATION_TARGET_LOCALES = SUPPORTED_LOCALES.filter((l) => l !== "ar") as SupportedLocale[];

/** English names, which is what the model is steered with. */
export const LOCALE_ENGLISH_NAMES: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  fr: "French",
  tr: "Turkish",
  id: "Indonesian",
  pt: "Portuguese",
  es: "Spanish",
  de: "German",
  ur: "Urdu",
  sq: "Albanian",
  it: "Italian",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian (Bokmål)",
  da: "Danish",
  ms: "Malay",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  hi: "Hindi",
};

export type TranslationPolicy = "STANDARD" | "LEGAL_REVIEW_REQUIRED" | "RELIGIOUS_LOCKED" | "SEO";

export interface TranslateInput {
  /** Plain text fields. Empty values are skipped. */
  fields: Record<string, string>;
  /** Tiptap JSON documents (stringified). */
  richFields?: Record<string, string>;
  /** Shown to the model so it knows the register  "campaign", "FAQ", … */
  itemLabel?: string;
  /** The language the source is written in. Arabic unless said otherwise. */
  sourceLocale?: string;
  /** Safety policy for protected content. */
  policy?: TranslationPolicy;
}

export interface TranslateOutput {
  fields: Record<string, string>;
  richFields: Record<string, string>;
  warnings: string[];
}

const MAX_TEXT = 12000;

function compact(value: string, max = MAX_TEXT): string {
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function stripCodeFence(value: string): string {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

const PROTECTED_LITERAL_RE = /https?:\/\/[^\s<>"')]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\{\{[^{}]+\}\}|<\/?[A-Za-z][^>]*>|\b(?:USD|EUR|TRY|SAR|AED|QAR|KWD|JOD|GBP)\b|(?:[$€£₺﷼]\s*)?\d+(?:[.,]\d+)?%?/giu;
const ICU_VARIABLE_RE = /\{([A-Za-z0-9_.-]+)(?=[,}])/g;

function protectedTokens(value: string): string[] {
  const literals = (value.match(PROTECTED_LITERAL_RE) ?? []).map((token) => token.trim());
  const variables = Array.from(value.matchAll(ICU_VARIABLE_RE), (match) => `{${match[1]}}`);
  return [...literals, ...variables].sort();
}

function sameProtectedTokens(source: string, translated: string): boolean {
  return JSON.stringify(protectedTokens(source)) === JSON.stringify(protectedTokens(translated));
}

function policyInstruction(policy: TranslationPolicy): string {
  if (policy === "LEGAL_REVIEW_REQUIRED") {
    return "This is legal/policy copy. Produce a faithful draft only; preserve clause numbering, official names and legal meaning. Never imply legal approval.";
  }
  if (policy === "SEO") {
    return "This is SEO copy. Localize search intent naturally for the target market; do not keyword-stuff or invent claims.";
  }
  return "This is general public-facing charity copy.";
}

/* ── Tiptap text lifting ─────────────────────────────────────────────────── */

type TiptapNode = { type?: string; text?: string; content?: TiptapNode[]; [k: string]: unknown };

function walkTexts(node: TiptapNode, visit: (n: TiptapNode) => void) {
  if (typeof node.text === "string") visit(node);
  if (Array.isArray(node.content)) for (const child of node.content) walkTexts(child, visit);
}

/** Text nodes of a document, in order; null when the string is not a Tiptap doc. */
function liftTexts(json: string): { doc: TiptapNode; texts: string[] } | null {
  const trimmed = json.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const doc = JSON.parse(trimmed) as TiptapNode;
    if (doc?.type !== "doc") return null;
    const texts: string[] = [];
    walkTexts(doc, (n) => texts.push(n.text as string));
    return { doc, texts };
  } catch {
    return null;
  }
}

function injectTexts(doc: TiptapNode, texts: string[]): string {
  let i = 0;
  walkTexts(doc, (n) => {
    const next = texts[i++];
    if (typeof next === "string") n.text = next;
  });
  return JSON.stringify(doc);
}

/* ── The model call ──────────────────────────────────────────────────────── */

async function askModel(userContent: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.CONTENT_LOCALIZATION_MODEL || "gpt-4o-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a professional translator for an Islamic charity working for Jerusalem and Al-Aqsa. " +
            "Return valid JSON only. Translate faithfully in a warm, dignified register. " +
            "Preserve every fact, number, name, URL, placeholder, hashtag, emoji and currency. Never add or invent content. " +
            "Keep Qur'anic verses and well-known Islamic phrases in their established form for the target language.",
        },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`AI translation failed: ${response.status} ${details.slice(0, 300)}`);
  }
  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw) throw new Error("AI translation returned no content");
  return JSON.parse(stripCodeFence(raw)) as Record<string, unknown>;
}

/** Translate one item into one locale. */
export async function translateItem(input: TranslateInput, targetLocale: string): Promise<TranslateOutput> {
  const target = LOCALE_ENGLISH_NAMES[targetLocale] ?? targetLocale;
  const source = LOCALE_ENGLISH_NAMES[input.sourceLocale ?? "ar"] ?? "Arabic";

  const plain: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.fields ?? {})) {
    if (typeof v === "string" && v.trim()) plain[k] = compact(v);
  }

  /* Rich documents become numbered text lists; a document that is not Tiptap
     JSON is treated as plain text under the same key. */
  const rich: Record<string, { doc: TiptapNode; texts: string[] }> = {};
  const richAsPlain: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.richFields ?? {})) {
    if (typeof v !== "string" || !v.trim()) continue;
    const lifted = liftTexts(v);
    if (lifted && lifted.texts.length) rich[k] = lifted;
    else if (!lifted) richAsPlain[k] = compact(v);
  }

  const policy = input.policy ?? "STANDARD";
  if (policy === "RELIGIOUS_LOCKED") {
    throw new Error("RELIGIOUS_LOCKED content must not be machine translated");
  }

  const out: TranslateOutput = { fields: {}, richFields: {}, warnings: [] };
  if (!Object.keys(plain).length && !Object.keys(rich).length && !Object.keys(richAsPlain).length) return out;

  const request = {
    fields: { ...plain, ...richAsPlain },
    richTexts: Object.fromEntries(Object.entries(rich).map(([k, v]) => [k, v.texts])),
  };

  const parsed = await askModel(
    [
      `Translate from ${source} to ${target} (${targetLocale}).`,
      input.itemLabel ? `Item type: ${input.itemLabel}.` : "",
      policyInstruction(policy),
      "Never translate Qur'anic Arabic text. If a source fragment is a Qur'anic verse, return it unchanged.",
      "Preserve placeholders, URLs, email addresses, currency codes, amounts, percentages and identifiers byte-for-byte.",
      "Terminology: Minbar Al-Aqsa / Minber-i Aksa is the institution brand; do not invent a different organization name. Keep Al-Aqsa, Al-Quds/Jerusalem, Zakat and Waqf terminology consistent with established usage in the target language.",
      "Do not translate registered legal entity names, bank account identifiers, IBAN/SWIFT values, payment-provider names or official document numbers unless the source explicitly supplies a translated form.",
      `Return exactly: {"fields":{<same keys, translated>},"richTexts":{<same keys, arrays of the SAME LENGTH and ORDER, each entry translated>}}.`,
      "Entries in richTexts are fragments of one formatted document, in reading order; translate each fragment so the sequence still reads as one text. Keep leading/trailing spaces of each fragment.",
      `Input: ${JSON.stringify(request)}`,
    ]
      .filter(Boolean)
      .join("\n")
  );

  const gotFields = (parsed.fields && typeof parsed.fields === "object" ? parsed.fields : {}) as Record<string, unknown>;
  for (const k of Object.keys(plain)) {
    const v = gotFields[k];
    if (typeof v === "string" && v.trim()) {
      if (sameProtectedTokens(plain[k], v)) out.fields[k] = v.trim();
      else out.warnings.push(`${targetLocale}:${k} rejected because a protected token changed`);
    }
  }
  for (const k of Object.keys(richAsPlain)) {
    const v = gotFields[k];
    if (typeof v === "string" && v.trim()) {
      if (sameProtectedTokens(richAsPlain[k], v)) out.richFields[k] = v.trim();
      else out.warnings.push(`${targetLocale}:${k} rejected because a protected token changed`);
    }
  }

  const gotRich = (parsed.richTexts && typeof parsed.richTexts === "object" ? parsed.richTexts : {}) as Record<string, unknown>;
  for (const [k, lifted] of Object.entries(rich)) {
    const arr = gotRich[k];
    if (!Array.isArray(arr) || arr.length !== lifted.texts.length || !arr.every((t) => typeof t === "string")) {
      /* A misaligned list would put the wrong sentence under the wrong
         heading; better to leave this field untranslated and say so. */
      continue;
    }
    const translatedTexts = arr as string[];
    if (!lifted.texts.every((sourceText, index) => sameProtectedTokens(sourceText, translatedTexts[index]))) {
      out.warnings.push(`${targetLocale}:${k} rejected because a protected token changed`);
      continue;
    }
    out.richFields[k] = injectTexts(structuredClone(lifted.doc), translatedTexts);
  }
  return out;
}

/**
 * Translate one item into many locales, a few at a time. Each locale is
 * independent: one failure is reported in `errors` and the rest still return.
 */
export async function translateToLocales(
  input: TranslateInput,
  locales: readonly string[],
  concurrency = 4
): Promise<{ translations: Record<string, TranslateOutput>; errors: Record<string, string> }> {
  const targets = locales.filter((l) => isValidLocale(l) && l !== (input.sourceLocale ?? "ar"));
  const translations: Record<string, TranslateOutput> = {};
  const errors: Record<string, string> = {};

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const locale = targets[cursor++];
      try {
        translations[locale] = await translateItem(input, locale);
      } catch (error) {
        errors[locale] = error instanceof Error ? error.message : String(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return { translations, errors };
}
