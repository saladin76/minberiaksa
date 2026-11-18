/** The scope a waqf gift link is signed for — never valid on a project gift or the donor's own documents. */
export function waqfGiftScope(waqfItemId: string): string {
  return `waqf:${waqfItemId}`;
}
