export type EditorialQuestion = { q: string; a: string; structuredData?: boolean };

export function readFaqDraft(value: string | null | undefined): EditorialQuestion[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is EditorialQuestion =>
      Boolean(item && typeof item.q === "string" && typeof item.a === "string"),
    ).slice(0, 30);
  } catch { return []; }
}

export function faqTranslationFields(value: string): Record<string, string> {
  return Object.fromEntries(readFaqDraft(value).flatMap((item, index) => [
    [`__faq_${index}_q`, item.q], [`__faq_${index}_a`, item.a],
  ]));
}

/** Keep question order and schema choices; refuse a partially translated FAQ. */
export function translatedFaq(value: string, fields: Record<string, string>): string | null {
  const rows = readFaqDraft(value);
  if (!rows.length || rows.some((_, index) =>
    !fields[`__faq_${index}_q`]?.trim() || !fields[`__faq_${index}_a`]?.trim(),
  )) return null;
  return JSON.stringify(rows.map((item, index) => ({
    ...item, q: fields[`__faq_${index}_q`], a: fields[`__faq_${index}_a`],
  })));
}
