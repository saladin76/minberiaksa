export type OrderedProject = { priority: number | null; createdAt: string | Date; id: string };

/** Same public ordering: explicit priorities first, then newest unranked projects. */
export function compareProjectOrder(a: OrderedProject, b: OrderedProject): number {
  if (a.priority === null && b.priority !== null) return 1;
  if (b.priority === null && a.priority !== null) return -1;
  if (a.priority !== null && b.priority !== null && a.priority !== b.priority) return a.priority - b.priority;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id.localeCompare(a.id);
}
