export const INSTITUTION_EMAIL_LOGO_PATH = "/minbar/assets/logo-horizontal.png";

/** Email clients cannot resolve relative paths; many strip base64 image URLs.
 * Repair the identifiable institutional logo without replacing donor/project photos. */
export function normalizeEmailAssets(html: string, siteUrl = "https://minberiaksa.org"): string {
  let origin = "https://minberiaksa.org";
  try { const site = new URL(siteUrl); if (site.protocol === "https:") origin = site.origin; } catch {}
  return html.replace(/<(?:img|a)\b[^>]*>/gi, tag => {
    const isImage = /^<img\b/i.test(tag);
    const alt = /\balt\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? "";
    return tag.replace(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi, (attribute, key: string, quote: string, value: string) => {
      let next = value;
      if (isImage && key.toLowerCase() === "src" && /^data:image\//i.test(value) && /منبر|minber|minbar/i.test(alt)) {
        next = new URL(INSTITUTION_EMAIL_LOGO_PATH, origin).href;
      } else if (/^\/(?!\/)/.test(value)) next = new URL(value, origin).href;
      return next === value ? attribute : `${key}=${quote}${next}${quote}`;
    });
  });
}
