/** Small shared data contract; validation stays off the public client bundle. */
export type RecurringPageSettings = {
  amounts: number[];
  byCurrency: Record<string, number[]>;
  projectMode: "AUTO" | "SELECTED";
  projectIds: string[];
};
export const DEFAULT_RECURRING_PAGE_SETTINGS: RecurringPageSettings = { amounts: [25, 50, 100, 250, 500], byCurrency: {}, projectMode: "AUTO", projectIds: [] };

/** Selection order is editorial; unpublished projects never enter this pool. */
export function recurringPageProjects<T extends { id: string }>(published: T[], settings: RecurringPageSettings): T[] {
  if (settings.projectMode === "AUTO") return published;
  const byId = new Map(published.map(project => [project.id, project]));
  return settings.projectIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
}

/** An exact local preset needs a usable conversion rate before checkout. */
export function recurringPageAmounts(settings: RecurringPageSettings, currency: string, rate: number | null) {
  const local = currency === "USD" || typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const override = local ? settings.byCurrency[currency] : undefined;
  return { amounts: override?.length ? override : settings.amounts, local: Boolean(override?.length) };
}
