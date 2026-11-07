/**
 * Scripts whose characters are wide and whose words carry no spaces. A search
 * result truncates by rendered width, so the same character budget that suits
 * Arabic or Latin overruns in Japanese and Chinese.
 */
const DENSE_SCRIPTS = new Set(["ja", "zh"]);
/** Sentence and clause enders worth cutting at, in the scripts that use them. */
const CJK_BREAKS = /[。、，．！？；：」』）]/;

/**
 * Clip a description to something a search engine will show whole.
 *
 * Every metadata route used to do its own `.slice(0, 165)`, which cuts mid-word
 * ("…للأسر المقدس"), leaves a dangling space before the ellipsis, ignores that a
 * Japanese description is far wider per character, and happily ships a stray
 * `<em>` from CMS copy. This does the job once:
 *
 *  · HTML tags and collapsed whitespace out first, so the length counts text;
 *  · dense scripts (ja/zh) get a shorter budget and break on their own
 *    punctuation rather than on spaces they do not have;
 *  · everything else backs off to the last word boundary, dropping any trailing
 *    punctuation the cut left behind;
 *  · the ellipsis is only added when something was actually removed.
 */
export function clipSeoDescription(text: string, locale?: string, max?: number): string {
  const clean = String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const dense = DENSE_SCRIPTS.has(String(locale ?? "").toLowerCase());
  const limit = max ?? (dense ? 90 : 160);
  if (clean.length <= limit) return clean;

  /* Cut one character early so there is room for the ellipsis inside the budget. */
  const window = clean.slice(0, limit - 1);
  if (dense) {
    let cut = -1;
    for (let i = window.length - 1; i >= Math.floor(limit * 0.6); i--) {
      if (CJK_BREAKS.test(window[i])) { cut = i + 1; break; }
    }
    return (cut > 0 ? window.slice(0, cut) : window).trim() + "…";
  }
  const lastSpace = window.lastIndexOf(" ");
  /* A single unbroken token longer than the budget (a URL, a long compound) has no
     word boundary to fall back to; cutting it mid-way beats returning nothing. */
  const body = lastSpace > limit * 0.5 ? window.slice(0, lastSpace) : window;
  return body.replace(/[\s،,;:.!?—–-]+$/u, "") + "…";
}
