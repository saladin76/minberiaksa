/** Detect Arabic prose leaked into another script, while keeping source verses
 * and opaque values that translation is explicitly required to preserve. */
export function hasUnexpectedArabicProse(source: string, localized: string): boolean {
  let prose = localized;
  for (const verse of source.match(/﴿[^﴿﴾]*﴾/gu) || []) prose = prose.split(verse).join("");
  prose = prose
    .replace(/https?:\/\/[^\s<>]+/gu, "")
    .replace(/\{\{[^{}]*\}\}|\$\{[^{}]*\}/gu, "")
    .replace(/<[^>]*>/gu, "")
    .replace(/[\p{N}\p{M}]/gu, "");
  return /\p{Script=Arabic}/u.test(prose);
}
