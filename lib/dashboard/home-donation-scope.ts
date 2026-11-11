/** Shared donor-facing scope for dashboard chart and donation rows.
 * Revenue KPI stats deliberately have a narrower contract: never pass a
 * filter that /api/admin/stats cannot apply without changing financial meaning.
 */
export type HomeDonationScope = {
  categoryId: string;
  campaignId: string;
  userId: string;
  start: string | null;
  end: string | null;
  locale: string;
  country: string;
  provider: string;
  status: string;
  donationType: string;
};

export function dashboardDonationScopeParams(scope: HomeDonationScope): URLSearchParams {
  const params = new URLSearchParams();
  const values: Record<string,string|null> = {
    categoryId: scope.categoryId,
    campaignId: scope.campaignId,
    userId: scope.userId,
    start: scope.start,
    end: scope.end,
    locale: scope.locale,
    country: scope.country,
    provider: scope.provider,
    status: scope.status,
    donationType: scope.donationType,
  };
  for (const [key,value] of Object.entries(values)) {
    if (value != null && value !== "" && value !== "all") params.set(key,value);
  }
  return params;
}

/** The stats endpoint does not implement donor/status/type filtering.
 * Accept only supported dimensions so unsupported filters cannot trigger
 * unnecessary KPI reloads or accidentally change the API request contract.
 */
export type HomeStatsScope = Pick<HomeDonationScope,
  "categoryId" | "campaignId" | "start" | "end" | "locale" | "country" | "provider"
>;

export function dashboardStatsScopeParams(
  scope: HomeStatsScope,
  period: string,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(scope)) {
    if (value != null && value !== "" && value !== "all") {
      query.set(key, value);
    }
  }
  query.set("period", period);
  return query;
}
