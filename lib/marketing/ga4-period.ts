export type Ga4Range = "today" | "yesterday" | "7d" | "28d" | "90d" | "180d" | "365d" | "custom";
export type Ga4Period = { range: Ga4Range; startDate?: string; endDate?: string };
export type Ga4Selection = Ga4Range | Ga4Period;
const RANGES: readonly string[] = ["today", "yesterday", "7d", "28d", "90d", "180d", "365d", "custom"];
export function isGa4Range(value: string | null): value is Ga4Range { return value !== null && RANGES.includes(value); }

export function parseGa4Period(input: { range?: unknown; startDate?: unknown; endDate?: unknown }, now = new Date()): Ga4Period {
  const range = input.range === undefined || input.range === null ? "28d" : input.range;
  if (typeof range !== "string" || !isGa4Range(range)) throw new Error("GA4_PERIOD_INVALID");
  if (range !== "custom") return { range };
  const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
  if (!validDate(input.startDate) || !validDate(input.endDate)) throw new Error("GA4_PERIOD_INVALID");
  const days = (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000;
  if (days < 0 || days >= 366 || input.endDate > now.toISOString().slice(0, 10)) throw new Error("GA4_PERIOD_INVALID");
  return { range, startDate: input.startDate, endDate: input.endDate };
}

export function ga4DateRange(selection: Ga4Selection) {
  const period = typeof selection === "string" ? { range: selection } : selection;
  if (period.range === "custom") {
    const checked = parseGa4Period(period);
    return { startDate: checked.startDate!, endDate: checked.endDate! };
  }
  if (period.range === "today" || period.range === "yesterday") return { startDate: period.range, endDate: period.range };
  return { startDate: `${period.range.slice(0, -1)}daysAgo`, endDate: "yesterday" };
}

export function ga4PeriodKey(period: Ga4Period) { return [period.range, period.startDate ?? "", period.endDate ?? ""].join(":"); }
