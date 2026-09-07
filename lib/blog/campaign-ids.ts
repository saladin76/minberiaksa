/** Normalize related campaign ids: unique, max 3, stable order. */
export function sanitizeCampaignIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of input) {
    if (typeof id !== "string" || !id.trim()) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 3) break;
  }
  return out;
}

export function orderCampaignsByIds<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is T => Boolean(r));
}
