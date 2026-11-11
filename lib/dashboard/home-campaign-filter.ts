/** Normalize the real /api/campaigns/all response for dashboard category/project filters. */
export type DashboardCampaignFilterOption = {
  id: string;
  title: string;
  categoryId?: string;
  categoryIds: string[];
};

type ApiCampaign = {
  id?: unknown;
  title?: unknown;
  categoryId?: unknown;
  categoryIds?: unknown;
  category?: { id?: unknown } | null;
  categories?: Array<{ id?: unknown }> | null;
};

function nonemptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeDashboardCampaignFilterOptions(input: unknown): DashboardCampaignFilterOption[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw: ApiCampaign) => {
    if (!raw || !nonemptyId(raw.id)) return [];
    const ids = [
      ...(Array.isArray(raw.categoryIds) ? raw.categoryIds : []),
      ...(Array.isArray(raw.categories) ? raw.categories.map(category => category?.id) : []),
      raw.categoryId,
      raw.category?.id,
    ].filter(nonemptyId);
    const unique = [...new Set(ids)];
    return [{
      id: raw.id,
      title: typeof raw.title === "string" ? raw.title : "",
      categoryId: unique[0],
      categoryIds: unique,
    }];
  });
}

export function dashboardCampaignBelongsToCategory(
  option: DashboardCampaignFilterOption | undefined,
  categoryId: string,
): boolean {
  return categoryId === "all" || !!option?.categoryIds.includes(categoryId);
}
