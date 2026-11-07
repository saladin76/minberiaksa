export type OrderedProject = { priority: number | null; createdAt: string | Date; id: string };

/** Same public ordering: explicit priorities first, then newest unranked projects. */
export function compareProjectOrder(a: OrderedProject, b: OrderedProject): number {
  if (a.priority === null && b.priority !== null) return 1;
  if (b.priority === null && a.priority !== null) return -1;
  if (a.priority !== null && b.priority !== null && a.priority !== b.priority) return a.priority - b.priority;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id.localeCompare(a.id);
}

/** A category overrides only its own rank; ties retain the global order. */
export function categoryProjectRank(raw: unknown, categoryId: string): number {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)[categoryId] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : Infinity;
}

export function orderProjectsInCategory<T extends { categoryPriorities?: unknown }>(rows: readonly T[], categoryId: string): T[] {
  return rows.map((row, index) => ({ row, index }))
    .sort((a, b) => categoryProjectRank(a.row.categoryPriorities, categoryId) - categoryProjectRank(b.row.categoryPriorities, categoryId) || a.index - b.index)
    .map(({ row }) => row);
}
