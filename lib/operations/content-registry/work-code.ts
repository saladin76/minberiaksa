export function normalizeWorkCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeWorkCode(parts: string[]) {
  const value = parts.filter(Boolean).join("-");
  return normalizeWorkCode(value || "WORK-ITEM");
}
