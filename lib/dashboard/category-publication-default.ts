/** Legacy categories with unset flags were published by default.
 * A missing field must not render a disabled switch in the dashboard.
 * Explicit false is a real editorial decision and must never be rewritten.
 */
export function categoryPublicationDisplayValue(kind: string, key: string, value: unknown): unknown {
  if (value !== undefined && value !== null) return value;
  if (kind === "categories" && (key === "isActive" || key === "navigationVisible")) return true;
  return value;
}
