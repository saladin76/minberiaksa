/** When true, list endpoints include inactive campaigns; otherwise only `isActive: true`. */
export function parseIncludeInactive(searchParams: URLSearchParams): boolean {
  const v = searchParams.get("isActiveFalse");
  if (v == null) return false;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}
