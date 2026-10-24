/** Escape a string for Telegram HTML (`parse_mode=HTML`). */
export function htmlEscape(input: string | number | null | undefined): string {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
