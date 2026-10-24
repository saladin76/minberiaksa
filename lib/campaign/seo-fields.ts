export type CampaignFaqItem = { q: string; a: string };

/** Validate the editor/API FAQ payload and persist one consistent public shape. */
export function parseCampaignFaqContent(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("FAQ must be valid JSON");
    }
  }
  if (!Array.isArray(parsed)) throw new Error("FAQ must be a list");
  if (parsed.length > 15) throw new Error("FAQ supports up to 15 questions");

  const rows: CampaignFaqItem[] = parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`FAQ item ${index + 1} is invalid`);
    }
    const record = item as Record<string, unknown>;
    const q = typeof record.q === "string" ? record.q.trim() : typeof record.question === "string" ? record.question.trim() : "";
    const a = typeof record.a === "string" ? record.a.trim() : typeof record.answer === "string" ? record.answer.trim() : "";
    if (!q && !a) return { q: "", a: "" };
    if (!q || !a) throw new Error(`FAQ item ${index + 1} needs both a question and answer`);
    if (q.length > 240) throw new Error(`FAQ question ${index + 1} is too long`);
    if (a.length > 2000) throw new Error(`FAQ answer ${index + 1} is too long`);
    return { q, a };
  });

  const completed = rows.filter((row) => row.q && row.a);
  return completed.length ? JSON.stringify(completed) : null;
}
