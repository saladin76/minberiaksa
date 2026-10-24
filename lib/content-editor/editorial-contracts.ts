export type EditorialJobKind = "ARTICLE" | "TRANSLATION" | "IMPROVE_ARTICLE";
export function editorialWeekKey(date = new Date()): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const first = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day.getTime() - first.getTime()) / 86400000) + 1) / 7);
  return day.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
const STOP = new Set(["في", "من", "الي", "على", "عن", "مع", "ما", "هو", "هي", "كيف", "دليل", "the", "a", "an", "of", "for", "to", "and", "in"]);
export function normalizedEditorialTopic(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
export function isDuplicateEditorialTopic(title: string, existing: readonly string[]): boolean {
  const normalized = normalizedEditorialTopic(title);
  const words = new Set(normalized.split(" ").filter((word) => word.length > 1 && !STOP.has(word)));
  return existing.some((candidate) => {
    const other = normalizedEditorialTopic(candidate);
    if (other === normalized) return true;
    const tokens = new Set(other.split(" ").filter((word) => word.length > 1 && !STOP.has(word)));
    const common = [...words].filter((word) => tokens.has(word)).length;
    const union = new Set([...words, ...tokens]).size;
    return Math.min(words.size, tokens.size) >= 3 && (common / union >= 0.7 || (Math.min(words.size, tokens.size) >= 4 && common / Math.min(words.size, tokens.size) >= 0.85));
  });
}
