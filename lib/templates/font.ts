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
  let out = html.replace(/\bstyle\s*=\s*(["'])(.*?)\1/gi, (_attribute, quote: string, css: string) => {
    const decoded = css.replace(/&quot;/g, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&amp;/g, "&");
    const next = arabic
      ? decoded.replace(/font-family\s*:\s*[^;]*/gi, `font-family:${ARABIC_EMAIL_FONT_STACK}`)
      : decoded.split(MODERN_SANS_STACK).join(APP_FONT_STACK);
    const escaped = next.replace(/&/g, "&amp;").replace(quote === '"' ? /"/g : /'/g, quote === '"' ? "&quot;" : "&#39;");
    return `style=${quote}${escaped}${quote}`;
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
