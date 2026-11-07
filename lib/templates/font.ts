import { EMAIL_SYMBOL_FONT, markEmailSymbols } from "./email-symbols";

/**
 * Email font stacks, with Cairo for Arabic and readable client fallbacks.
 * This is what email recipients should see by default.
 */
export const APP_FONT_STACK =
  '"Poppins", "Cairo", -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';

export const ARABIC_EMAIL_FONT_STACK = '"Cairo", Tahoma, Arial, sans-serif';

/**
 * What @usewaypoint/email-builder renders for the default `MODERN_SANS` enum.
 * We string-swap this for APP_FONT_STACK so blocks using the editor's default
 * font carry the same look as the rest of the app. Admin-chosen fonts (BOOK_SANS,
 * MODERN_SERIF, etc.) are untouched.
 */
export const MODERN_SANS_STACK =
  '"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif';

/** Stylesheet URL used by emails AND the editor preview. */
export const APP_FONT_GOOGLE_LINK =
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap";

export function applyAppFont(html: string, locale?: string): string {
  const arabic = locale?.toLowerCase().split(/[-_]/)[0] === "ar";
  let out = html.replace(/<[a-z][^>]*>/gi, tag => {
    const symbolic = /data-email-symbol=["']true["']/i.test(tag);
    return tag.replace(/\bstyle\s*=\s*(["'])(.*?)\1/gi, (_attribute, quote: string, css: string) => {
      const decoded = css.replace(/&quot;/g, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&amp;/g, "&");
      const next = arabic && !symbolic
        ? decoded.replace(/font-family\s*:\s*[^;]*/gi, `font-family:${ARABIC_EMAIL_FONT_STACK}`)
        : decoded.split(MODERN_SANS_STACK).join(APP_FONT_STACK);
      const escaped = next.replace(/&/g, "&amp;").replace(quote === '"' ? /"/g : /'/g, quote === '"' ? "&quot;" : "&#39;");
      return `style=${quote}${escaped}${quote}`;
    });
  });
  const linkTag = `<link rel="stylesheet" href="${APP_FONT_GOOGLE_LINK}" />`;
  if (out.includes(APP_FONT_GOOGLE_LINK)) return out;
  if (out.includes("<head>")) {
    out = out.replace("<head>", `<head>${linkTag}`);
  } else if (/<head[^>]*>/.test(out)) {
    out = out.replace(/<head([^>]*)>/, `<head$1>${linkTag}`);
  } else out = out.replace(/<html[^>]*>/i, `$&<head>${linkTag}</head>`);
  return out;
}

/** Transactional mail has a restrained scale in every language. Explicit
 * inline styles also work in email clients which discard head stylesheets. */
export function automaticEmailHtml(html: string, locale?: string): string {
  const font = ARABIC_EMAIL_FONT_STACK;
  const styled = markEmailSymbols(html).replace(/<(body|main|table|td|div|p|span|a|strong|b|li|h[1-6])\b([^>]*)>/gi, (_tag, tag: string, attrs: string) => {
    const heading = /^h[1-6]$/i.test(tag);
    const symbolic = /data-email-symbol=["']true["']/i.test(attrs);
    const baseSize = heading ? (/^h1$/i.test(tag) ? 22 : 18) : 14;
    const styleMatch = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    let css = (styleMatch?.[2] ?? "").replace(/&quot;/g, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&amp;/g, "&");
    const requested = /(?:^|;)\s*font-size\s*:\s*([\d.]+)px\b/i.exec(css);
    const size = requested ? Math.min(Number(requested[1]), symbolic ? 64 : baseSize) : baseSize;
    const symbolLineHeight = symbolic ? /(?:^|;)\s*line-height\s*:\s*([^;]+)/i.exec(css)?.[1] : null;
    css = css.replace(/(?:^|;)\s*(?:font-family|font-size|line-height|-webkit-text-size-adjust)\s*:[^;]*/gi, "");
    css = css.replace(/;{2,}/g, ";").replace(/^;|;$/g, "");
    css += `${css ? ";" : ""}font-family:${symbolic ? EMAIL_SYMBOL_FONT : font};font-size:${size}px;line-height:${symbolLineHeight || (heading ? "1.5" : "1.8")};-webkit-text-size-adjust:100%`;
    const rest = attrs.replace(/\bstyle\s*=\s*(["'])(.*?)\1/i, "").trim();
    return `<${tag}${rest ? ` ${rest}` : ""} style="${css.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`;
  });
  const light = '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">';
  const htmlWithScheme = /<meta[^>]+name=["']color-scheme["']/i.test(styled)
    ? styled
    : /<head\b[^>]*>/i.test(styled) ? styled.replace(/<head\b[^>]*>/i, `$&${light}`) : styled.replace(/<html\b[^>]*>/i, `$&<head>${light}</head>`);
  return applyAppFont(htmlWithScheme, locale);
}
