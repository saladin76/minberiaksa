/**
 * What the Albaraka scheduler does with a RAMADAN plan after a paid day (phase 2b). Pure: the
 * scheduler passes the plan and the dashboard's 1 Ramadan, and applies the result inside its
 * own settle transaction. The next day's amount becomes the plan amount, split over the plan's
 * projects, so the existing charge path bills it unchanged; after the last day the plan closes.
 */
import { nextRamadanCharge, parseRamadanRule, splitAmount } from "./ramadan-schedule";
import { DEFAULT_RAMADAN_SETTINGS } from "../minbar/ramadan-settings";

/** 1 Ramadan from the stored settings document; the default when it is missing or malformed. */
export function ramadanStartDateFrom(configuration: unknown): string {
  const value = (configuration as { startDate?: unknown } | null | undefined)?.startDate;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value) return value;
  return DEFAULT_RAMADAN_SETTINGS.startDate;
}

export type RamadanAdvance =
  | { done: false; nextBillingDate: Date; amount: number; items: { campaignId: string; amount: number }[] }
  | { done: true; nextBillingDate: null };

export function ramadanAdvance(scheduleRule: unknown, startDate: string, fallbackProjectIds: string[], now: Date): RamadanAdvance {
  const rule = parseRamadanRule(scheduleRule);
  if (!rule) return { done: true, nextBillingDate: null };
  const next = nextRamadanCharge(rule, startDate, now);
  if (!next) return { done: true, nextBillingDate: null };
  const stored = (scheduleRule as { projectIds?: unknown }).projectIds;
  const projectIds = Array.isArray(stored) && stored.every((id) => typeof id === "string") && stored.length ? (stored as string[]) : fallbackProjectIds;
  const parts = splitAmount(next.amount, Math.max(1, projectIds.length));
  return { done: false, nextBillingDate: next.at, amount: next.amount, items: projectIds.map((campaignId, i) => ({ campaignId, amount: parts[i] })) };
}
