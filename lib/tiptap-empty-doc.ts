/** Serialized empty TipTap doc — safe fallback when persisting campaign/blog translations. */
export const EMPTY_TIPTAP_DOC_JSON = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

/**
 * True when a stored description carries no text the reader would see.
 *
 * Descriptions reach the dashboard in two shapes: a serialized TipTap doc
 * (what the editor emits) and the older plain text / HTML rows that predate
 * the editor. The public page renders both, and the server accepts both, so
 * the forms must count both as content — a legacy string is only empty when
 * it is blank. A doc is empty when no text node in the tree has a
 * non-whitespace character; that mirrors `hasMeaningfulEditorContent` in
 * `lib/campaign/admin-create-core.ts`, so the client never blocks a save the
 * server would take, nor the reverse.
 */
export function isEditorContentEmpty(value: string | null | undefined): boolean {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!trimmed.startsWith("{")) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not JSON after all — a plain description that happens to open with "{".
    return false;
  }

  const stack: unknown[] = [parsed];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    const record = current as Record<string, unknown>;
    if (typeof record.text === "string" && record.text.trim()) return false;
    for (const child of Object.values(record)) stack.push(child);
  }
  return true;
}
