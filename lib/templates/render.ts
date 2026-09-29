import type { TReaderDocument } from "@usewaypoint/email-builder";
import { mergeDocument, mergeText, type TemplateContext } from "./variables";
import { APP_FONT_STACK, APP_FONT_GOOGLE_LINK, MODERN_SANS_STACK } from "./font";

/**
 * Lazy-loaded so `@usewaypoint/email-builder` (which runs React.createContext
 * at module init) only executes at request time. Importing it at module scope
 * breaks Next 16's "Collect page data" step under React 19.
 */
async function getRenderer() {
  const mod = await import("@usewaypoint/email-builder");
  return mod.renderToStaticMarkup;
}

/**
 * Replace email-builder's default MODERN_SANS stack with the app's font and
 * inject a Google-Fonts <link> so clients that support web fonts get Poppins
 * + Noto Kufi Arabic. Clients that don't fall back to the system fonts in
 * APP_FONT_STACK.
 */
export function applyAppFont(html: string): string {
  let out = html.split(MODERN_SANS_STACK).join(APP_FONT_STACK);
  const linkTag = `<link rel="stylesheet" href="${APP_FONT_GOOGLE_LINK}" />`;
  if (out.includes("<head>")) {
    out = out.replace("<head>", `<head>${linkTag}`);
  } else if (/<head[^>]*>/.test(out)) {
    out = out.replace(/<head([^>]*)>/, `<head$1>${linkTag}`);
  }
  return out;
}

/** The prop that carries a block's content, per block type. */
const CONTENT_PROP: Record<string, string> = {
  Image: "url",
  Avatar: "imageUrl",
  Button: "url",
  Heading: "text",
  Text: "text",
  Html: "contents",
};

type DocBlock = { type?: string; data?: { props?: Record<string, unknown>; childrenIds?: unknown } };

/**
 * Drop the blocks whose content came from a variable that merged to nothing.
 *
 * An update template has a photo slot (`{{update.image}}`), a video still and
 * a "watch the video" button; an update with no video must not send a broken
 * image and a button to nowhere. Only blocks whose ORIGINAL content held a
 * `{{token}}` are candidates, so a template's hand-made static blocks are
 * never touched. The block is removed from every `childrenIds` list (the
 * layout root and any container/columns inside it).
 */
export function pruneEmptyVariableBlocks(original: TReaderDocument, merged: TReaderDocument): TReaderDocument {
  const source = original as unknown as Record<string, DocBlock>;
  const out = merged as unknown as Record<string, DocBlock>;
  const empty = new Set<string>();
  for (const [id, block] of Object.entries(out)) {
    const prop = block?.type ? CONTENT_PROP[block.type] : undefined;
    if (!prop) continue;
    const before = source[id]?.data?.props?.[prop];
    if (typeof before !== "string" || !before.includes("{{")) continue;
    const after = block.data?.props?.[prop];
    const value = typeof after === "string" ? after.trim() : "";
    if (!value || value === "https://" || value === "http://") empty.add(id);
  }
  if (!empty.size) return merged;

  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      next[key] =
        key === "childrenIds" && Array.isArray(value)
          ? value.filter((child) => !(typeof child === "string" && empty.has(child)))
          : strip(value);
    }
    return next;
  };
  const pruned = strip(out) as Record<string, unknown>;
  for (const id of empty) delete pruned[id];
  return pruned as unknown as TReaderDocument;
}

export async function renderEmailHtml(
  document: TReaderDocument,
  ctx: TemplateContext
): Promise<string> {
  const renderToStaticMarkup = await getRenderer();
  const merged = pruneEmptyVariableBlocks(document, mergeDocument(document, ctx));
  const raw = renderToStaticMarkup(merged, { rootBlockId: "root" });
  return applyAppFont(raw);
}

export function renderEmailSubject(subject: string, ctx: TemplateContext): string {
  return mergeText(subject, ctx);
}
