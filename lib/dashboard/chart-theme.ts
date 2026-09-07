/**
 * Single source of truth for dashboard chart colours.
 *
 * `/dashboard` and `/monthly` each declared their own identical `CHART_COLORS` block built
 * on `#2563eb` — a generic Tailwind blue that is not the brand colour — while individual
 * series inside the same files used yet more raw literals (`#22c55e`, `#eab308`, `#64748b`).
 * The result was that no two charts agreed, and none matched the brand.
 *
 * `primary` is the brand blue. The categorical ramp is ordered so that adjacent series stay
 * distinguishable, and every colour is dark enough to hold its own against a white card while
 * remaining legible for text labels drawn in the same hue.
 */
export const CHART_THEME = {
  primary: "#025EB8",
  primaryLight: "#8FC4FB",
  primaryDark: "#024A92",
  secondary: "#FA5D17",
  grid: "#E2E8F0",
  text: "#475569",
  axis: "#94A3B8",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#E2E8F0",
} as const;

/**
 * Categorical series palette. Brand blue leads; the rest are spaced around the wheel so a
 * reader can tell neighbouring series apart without relying on the legend order.
 */
export const CHART_SERIES = [
  "#025EB8", // brand blue
  "#FA5D17", // brand orange
  "#0E9F6E", // green
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#D97706", // amber
  "#DB2777", // pink
  "#475569", // slate
] as const;

/** Semantic colours for status-bearing series (paid / pending / failed …). */
export const CHART_STATUS = {
  success: "#0E9F6E",
  warning: "#D97706",
  danger: "#E11D48",
  neutral: "#94A3B8",
  info: "#025EB8",
} as const;

/** Shared recharts tooltip styling so every tooltip on the dashboard looks the same. */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: CHART_THEME.tooltipBg,
  border: `1px solid ${CHART_THEME.tooltipBorder}`,
  borderRadius: 12,
  boxShadow: "0 4px 16px rgba(16,24,40,0.08)",
  fontSize: 12,
  padding: "8px 12px",
} as const;

export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length];
}
