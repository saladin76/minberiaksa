export type HistorySource = "delivery" | "legacy";
export type HistoryCursor = { at: string; id: string; source: HistorySource };

export function parseHistoryCursor(value: string | null): HistoryCursor | null {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString());
    if (!cursor || !/^[a-f0-9]{24}$/i.test(cursor.id) || !["delivery", "legacy"].includes(cursor.source) ||
      typeof cursor.at !== "string" || !Number.isFinite(Date.parse(cursor.at))) throw new Error();
    return cursor;
  } catch { throw new Error("INVALID_CURSOR"); }
}

/** A stable cross-table keyset: newest first, then source and id descending. */
export function historyBefore(cursor: HistoryCursor | null, source: HistorySource) {
  if (!cursor) return {};
  const sameTime = source < cursor.source ? {} : source === cursor.source ? { id: { lt: cursor.id } } : null;
  return { OR: [{ createdAt: { lt: new Date(cursor.at) } }, ...(sameTime ? [{ createdAt: new Date(cursor.at), ...sameTime }] : [])] };
}

export function historyPage<T extends { id: string; source: HistorySource; createdAt: Date }>(rows: T[], size = 50) {
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.source.localeCompare(a.source) || b.id.localeCompare(a.id));
  const items = sorted.slice(0, size);
  const last = items.at(-1);
  const next = sorted.length > size && last ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id, source: last.source })).toString("base64url") : null;
  return { items, next };
}
