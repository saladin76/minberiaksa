import type { CartFreqKey } from "@/lib/minbar/cart";

/**
 * Which cadence a campaign's giving dialog recommends (badge + preselected).
 * Set per campaign on the dashboard edit page (`Campaign.recommendedFrequency`).
 *
 *   unset / unknown  → "monthly" (the default for every campaign)
 *   "none"           → nothing recommended, nothing preselected
 *   "monthly" | "friday" | "daily" | "once" → that one
 */

export const RECOMMENDED_FREQUENCY_VALUES = ["monthly", "friday", "daily", "once", "none"] as const;
export type RecommendedFrequencySetting = (typeof RECOMMENDED_FREQUENCY_VALUES)[number];

export const DEFAULT_RECOMMENDED_FREQUENCY: CartFreqKey = "monthly";

export function isRecommendedFrequencySetting(value: unknown): value is RecommendedFrequencySetting {
  return typeof value === "string" && (RECOMMENDED_FREQUENCY_VALUES as readonly string[]).includes(value);
}

/** The cadence to recommend for a stored value, or null for "none". */
export function parseRecommendedFrequency(raw: unknown): CartFreqKey | null {
  if (raw === "none") return null;
  return isRecommendedFrequencySetting(raw) ? (raw as CartFreqKey) : DEFAULT_RECOMMENDED_FREQUENCY;
}
