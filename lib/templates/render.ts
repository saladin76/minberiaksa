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

export async function renderEmailHtml(
  document: TReaderDocument,
  ctx: TemplateContext
): Promise<string> {
  const renderToStaticMarkup = await getRenderer();
  const merged = mergeDocument(document, ctx);
  const raw = renderToStaticMarkup(merged, { rootBlockId: "root" });
  return applyAppFont(raw);
}

export function renderEmailSubject(subject: string, ctx: TemplateContext): string {
  return mergeText(subject, ctx);
}
