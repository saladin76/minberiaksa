import { contentToTiptapDocument } from "../blog/rich-text";

export type PublicRichNode = { tag: "p" | "h2" | "h3" | "h4" | "h5" | "h6" | "ol" | "ul" | "li" | "strong" | "em" | "u" | "s" | "a" | "br" | "blockquote" | "span"; text?: string; href?: string; start?: number; children?: PublicRichNode[] };
type EditorNode = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: EditorNode[] };
function safeHref(value: unknown): string | undefined {
  return typeof value === "string" && /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(value.trim()) && !/[\u0000-\u0020]/.test(value.trim()) ? value.trim() : undefined;
}
function convert(node: EditorNode, depth = 0): PublicRichNode[] {
  if (depth > 50) return [];
  if (node.type === "text" && typeof node.text === "string") {
    let result: PublicRichNode = { tag: "span", text: node.text };
    for (const mark of node.marks || []) {
      const tag = ({ bold: "strong", italic: "em", underline: "u", strike: "s", link: "a" } as const)[mark.type as "bold" | "italic" | "underline" | "strike" | "link"];
      if (!tag) continue;
      const href = tag === "a" ? safeHref(mark.attrs?.href) : undefined;
      if (tag === "a" && !href) continue;
      result = { tag, ...(href ? { href } : {}), children: [result] };
    }
    return [result];
  }
  if (node.type === "hardBreak") return [{ tag: "br" }];
  const children = (node.content || []).flatMap(child => convert(child, depth + 1));
  const tag = node.type === "heading" ? `h${Math.max(2, Math.min(6, Number(node.attrs?.level) || 2))}` as PublicRichNode["tag"]
    : ({ paragraph: "p", orderedList: "ol", bulletList: "ul", listItem: "li", blockquote: "blockquote" } as const)[node.type as "paragraph"];
  if (!tag) return children;
  const start = tag === "ol" && Number.isInteger(node.attrs?.start) && Number(node.attrs?.start) > 0 ? Number(node.attrs?.start) : undefined;
  return [{ tag, children, ...(start ? { start } : {}) }];
}
function entity(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, value: string) => {
    if (value.startsWith("#")) { const n = value[1].toLowerCase() === "x" ? parseInt(value.slice(2), 16) : parseInt(value.slice(1), 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[value.toLowerCase()] || whole;
  });
}
/** A restricted HTML reader, rendered as React text/elements, never executable HTML. */
function legacyHtml(value: string): PublicRichNode[] {
  const root: PublicRichNode = { tag: "span", children: [] }, stack = [root];
  const clean = value.replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  for (const token of clean.match(/<[^>]*>|[^<]+/g) || []) {
    if (!token.startsWith("<")) { stack[stack.length - 1].children!.push({ tag: "span", text: entity(token) }); continue; }
    const closing = /^<\//.test(token), name = /^<\/?\s*([a-z0-9]+)/i.exec(token)?.[1].toLowerCase();
    const alias = name === "b" ? "strong" : name === "i" ? "em" : name === "h1" ? "h2" : name;
    if (!alias || !["p", "h2", "h3", "h4", "h5", "h6", "ol", "ul", "li", "strong", "em", "u", "s", "a", "br", "blockquote", "span"].includes(alias)) continue;
    if (closing) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === alias) { stack.length = i; break; } continue; }
    const node: PublicRichNode = { tag: alias as PublicRichNode["tag"], children: [] };
    if (alias === "a") node.href = safeHref(entity(/\bhref\s*=\s*["']([^"']*)["']/i.exec(token)?.[1] || ""));
    if (alias === "ol") { const n = Number(/\bstart\s*=\s*["']?(\d+)/i.exec(token)?.[1]); if (Number.isInteger(n) && n > 0) node.start = n; }
    stack[stack.length - 1].children!.push(node);
    if (alias !== "br" && stack.length < 50) stack.push(node);
  }
  return root.children!;
}
export function publicRichText(value: string): PublicRichNode[] {
  try { const parsed = JSON.parse(value); if (parsed?.type === "doc") return convert(parsed); } catch { /* Legacy text follows. */ }
  if (/<(?:p|h[1-6]|ol|ul|li|strong|b)\b/i.test(value)) return legacyHtml(value);
  return convert(contentToTiptapDocument(value) as EditorNode);
}
