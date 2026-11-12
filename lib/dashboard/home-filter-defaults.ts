/** Explicit defaults for the home dashboard's user-facing filter controls. */
export type HomeFilterValues = {
  categoryId:string; campaignId:string; userId:string;
  period:string; dateFrom:string; dateTo:string;
  locale:string; country:string; provider:string;
  status:string; donationType:string; donationSearch:string;
};

export const HOME_FILTER_DEFAULTS: Readonly<HomeFilterValues> = {
  categoryId:"all", campaignId:"all", userId:"all",
  period:"month", dateFrom:"", dateTo:"",
  locale:"all", country:"all", provider:"all",
  status:"RESOLVED", donationType:"all", donationSearch:"",
};

export function homeFiltersAreModified(values:HomeFilterValues): boolean {
  return (Object.keys(HOME_FILTER_DEFAULTS) as Array<keyof HomeFilterValues>)
    .some(key => values[key] !== HOME_FILTER_DEFAULTS[key]);
}
