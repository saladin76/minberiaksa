/** Refuse proposals that flatten paragraphs or modify stored HTML/Markdown layout.
 * Tiptap structure is protected separately by translating text nodes only. */
export function hasSameTextStructure(source: string, translated: string): boolean {
  const tags = (value: string) => value.match(/<!--[\s\S]*?-->|<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi) || [];
  if (JSON.stringify(tags(source)) !== JSON.stringify(tags(translated))) return false;
  const lines = (value: string) => value.trim().split(/\r?\n/).map(line => {
    const text = line.trim();
    if (!text) return "blank";
    return text.match(/^(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/)?.[0].trim() || "text";
  });
  return JSON.stringify(lines(source)) === JSON.stringify(lines(translated));
}
