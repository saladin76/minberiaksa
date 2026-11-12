/** One shared contract for unassigned locale/country across the chart, ledger and KPIs.
 * MongoDB + Prisma: null is not equivalent to a missing field. Include isSet:false
 * explicitly so legacy donations are not excluded by the "__unset" UI option.
 */
export function dashboardLocaleWhere(locale: string | null | undefined): Record<string, unknown> | null {
  const value = locale?.trim();
  if (!value || value === "all") return null;
  return value === "__unset"
    ? { OR: [{ locale: null }, { locale: "" }, { locale: { isSet: false } }] }
    : { locale: value };
}

export function dashboardCountryWhere(country: string | null | undefined): Record<string, unknown> | null {
  const value = country?.trim();
  if (!value || value === "all") return null;
  return value === "__unset"
    ? { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }, { donorCountryCode: { isSet: false } }] }
    : { donorCountryCode: value.toUpperCase() };
}
