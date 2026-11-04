export type ProjectFilterOption = {
  key: string;
  id: string;
  kind: "category" | "programme" | "page";
  name: string;
  slug: string;
  baseSlug?: string | null;
  previousSlugs?: string[];
  /** Old category/programme hash links continue to resolve after linking a page. */
  hashes?: string[];
  href?: string;
  icon: string;
  order: number | null;
  projectIds: string[];
};

export function sortProjectFilters<T extends { key: string; order: number | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.key.localeCompare(b.key));
}

export function applyProjectFilterOrder<T extends { key: string; order: number | null }>(rows: readonly T[], saved: unknown): T[] {
  const byKey = new Map(rows.map(row => [row.key, row]));
  const ordered: T[] = [];
  if (Array.isArray(saved)) for (const key of saved) {
    if (typeof key !== "string") continue;
    const row = byKey.get(key);
    if (row) { ordered.push(row); byKey.delete(key); }
  }
  return [...ordered, ...sortProjectFilters([...byKey.values()])];
}

/** Mirrors the major-project page's published members and active grid limits. */
export function programmeProjectIds(items: readonly { kind: string; refId: string }[], blocks: readonly { kind: string; isActive: boolean; maxItems: number | null }[], published: ReadonlySet<string>) {
  const linked = [...new Set(items.filter(item => item.kind === "CAMPAIGN" && published.has(item.refId)).map(item => item.refId))];
  const grids = blocks.filter(block => block.kind === "CAMPAIGNS");
  if (!grids.length) return linked;
  return [...new Set(grids.filter(block => block.isActive !== false).flatMap(block => block.maxItems && block.maxItems > 0 ? linked.slice(0, block.maxItems) : linked))];
}

/** Use the public pool for visibility, CMS order for selection, and never link
 * the aggregate donation project to itself as one of its child cards. */
export function selectProgrammeRelatedProjects<T extends { id: string }>(pool: readonly T[], ids: readonly string[], currentId: string): T[] {
  const publicRows = new Map(pool.map(row => [row.id, row]));
  return [...new Set(ids)].filter(id => id !== currentId).flatMap(id => publicRows.has(id) ? [publicRows.get(id)!] : []);
}

const PUBLIC_FILTERS = [
  { role: "gaza", aliases: ["region-gaza"] },
  { role: "aqsa", aliases: ["region-al-aqsa"] },
  { role: "jerusalem", aliases: ["region-al-quds"] },
  { role: "zakat", aliases: ["type-zakat"] },
  { role: "waqf", aliases: ["type-waqf"] },
  { role: "restoration", aliases: ["alquds-home-restoration", "al-quds-home-restoration"] },
  { role: "recurring", aliases: ["type-recurring"] },
  { role: "ibadan", aliases: ["ibadan-lana"] },
] as const;

/** Public presentation only: keep the registry and old hash destinations intact. */
export function publicProjectFilters(rows: readonly ProjectFilterOption[], labels: Readonly<Record<string, string>>): ProjectFilterOption[] {
  const roleOf = (row: ProjectFilterOption) => PUBLIC_FILTERS.find(entry =>
    row.key === "page:" + entry.role || [row.baseSlug, row.slug, ...(row.previousSlugs ?? []), ...(row.hashes ?? [])].some(slug => entry.aliases.some(alias => alias === slug)));
  return rows.map((row, index) => {
    const entry = roleOf(row);
    return { row, index, entry, rank: entry ? PUBLIC_FILTERS.indexOf(entry) : PUBLIC_FILTERS.length };
  }).filter(value => value.entry?.role !== "ibadan")
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ row, entry }) => entry ? { ...row, name: labels[entry.role] || row.name } : row);
}
