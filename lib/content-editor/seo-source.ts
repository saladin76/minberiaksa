/** Give research the Arabic copy, rather than editor JSON keys and media attributes. */
export function seoSourceText(value: string): string {
  const input = value.trim();
  if (!input) return "";
  if (/^[{\[]/.test(input)) {
    try {
      const parsed = JSON.parse(input);
      if (parsed?.type === "doc") {
        const visit = (value: unknown): string => {
          if (!value || typeof value !== "object") return "";
          const node = value as {type?: string; text?: string; content?: unknown[]};
          if (typeof node.text === "string") return node.text;
          if (node.type === "hardBreak") return "\n";
          const text = Array.isArray(node.content) ? node.content.map(visit).join("") : "";
          return node.type === "heading" ? "## " + text + "\n\n" : node.type === "paragraph" ? text + "\n\n" : text;
        };
        return visit(parsed).trim();
      } else {
        const strings = (item: unknown): string[] => typeof item === "string" ? [seoSourceText(item)]
          : Array.isArray(item) ? item.flatMap(strings)
          : item && typeof item === "object" ? Object.values(item).flatMap(strings) : [];
        return strings(parsed).filter(Boolean).join("\n");
      }
    } catch { /* Plain copy may legitimately begin with a brace. */ }
  }
  if (!/<\/?[a-z][^>]*>/i.test(input)) return input;
  return input.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(?:p|h[1-6]|li|div)>/gi, "\n\n").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").trim();
}
