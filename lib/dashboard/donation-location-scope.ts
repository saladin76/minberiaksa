/** One shared contract for unassigned locale/country across the chart, ledger and KPIs.
 * MongoDB + Prisma: null is not equivalent to a missing field. Include isSet:false
 * explicitly so legacy donations are not excluded by the "__unset" UI option.
 */

/** "a,b,c" means any of them; one value gives exactly the same condition as before (owner, 2026-11-21). */
function anyOf(raw: string | null | undefined, one: (v: string) => Record<string, unknown> | null): Record<string, unknown> | null {
  const values = [...new Set(String(raw ?? "").split(",").map((v) => v.trim()).filter((v) => v && v !== "all"))];
  if (values.length <= 1) return one(values[0] ?? "");
  const parts = values.map(one).filter((w): w is Record<string, unknown> => w !== null);
  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : { OR: parts };
}

export function dashboardLocaleWhere(locale: string | null | undefined): Record<string, unknown> | null {
  return anyOf(locale, dashboardLocaleWhereOne);
}

function dashboardLocaleWhereOne(locale: string | null | undefined): Record<string, unknown> | null {
  const value = locale?.trim();
  if (!value || value === "all") return null;
  return value === "__unset"
    ? { OR: [{ locale: null }, { locale: "" }, { locale: { isSet: false } }] }
    : { locale: value };
}

export function dashboardCountryWhere(country: string | null | undefined): Record<string, unknown> | null {
  return anyOf(country, dashboardCountryWhereOne);
}

function dashboardCountryWhereOne(country: string | null | undefined): Record<string, unknown> | null {
  const value = country?.trim();
  if (!value || value === "all") return null;
  return value === "__unset"
    ? { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }, { donorCountryCode: { isSet: false } }] }
    : { donorCountryCode: value.toUpperCase() };
}
