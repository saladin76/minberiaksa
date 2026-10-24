/** Combine the two database-ordered groups without letting null priorities
 * sort ahead of explicitly ranked projects. `limit` is applied after the
 * ranked group, so an all-ranked page never gets displaced by newer rows. */
export function mergeProjectPriorityGroups<T>(
  prioritized: readonly T[],
  newestUnprioritized: readonly T[],
  limit?: number,
): T[] {
  const rows = [...prioritized, ...newestUnprioritized];
  return Number.isInteger(limit) && Number(limit) > 0 ? rows.slice(0, Number(limit)) : rows;
}
