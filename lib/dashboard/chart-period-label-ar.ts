import { dt } from "@/lib/dashboard/i18n";
/** Matches dashboard chart period select + custom range inputs */
export type DashboardChartPeriod =
  | "day"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "all"
  | "custom";

const LABELS_AR: Record<DashboardChartPeriod, string> = {
  get day() { return dt("اليوم"); },
  get yesterday() { return dt("أمس"); },
  get week() { return dt("أسبوع"); },
  get month() { return dt("شهر"); },
  get year() { return dt("سنة"); },
  get all() { return dt("كل الوقت"); },
  get custom() { return dt("مخصص"); },
};

/**
 * Arabic label mirroring what the period filter shows:
 * presets by name, custom range as «مخصص: من … إلى …», all time as «كل الوقت».
 */
export function getDashboardChartPeriodLabelAr(
  chartPeriod: DashboardChartPeriod,
  dateFrom: string,
  dateTo: string
): string {
  if (chartPeriod === "all") return LABELS_AR.all;
  if (dateFrom && dateTo) return dt("مخصص: من {0} إلى {1}", [dateFrom, dateTo]);
  return LABELS_AR[chartPeriod];
}
