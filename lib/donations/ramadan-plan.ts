/**
 * Builds a Ramadan plan from what the donor chose, against the dashboard settings — pure, so the
 * API route stays thin and every rule here is tested. Amounts are USD (the settings' base currency).
 */
import { nextRamadanCharge, parseRamadanRule, splitAmount, ramadanTotal, ZONE_CITIES, RAMADAN_DAYS, type RamadanRule, type RamadanSlot } from "./ramadan-schedule";

export type RamadanPlanInput = {
  days: { day: number; amount: number }[];
  slot: RamadanSlot;
  timezone: string;
  lat?: number | null;
  lng?: number | null;
  projectIds: string[];
  intent: "self" | "parents" | "other";
  onBehalf?: string | null;
  remind: boolean;
};
export type RamadanPlanSettings = { enabled: boolean; hijriYear: number; startDate: string; projectIds: string[] };
export type RamadanPlanBuild =
  | { ok: true; rule: RamadanRule & { projectIds: string[]; intent: RamadanPlanInput["intent"]; onBehalf: string | null; remind: boolean }; first: { day: number; at: Date; amount: number }; firstItems: { campaignId: string; amount: number }[]; total: number }
  | { ok: false; error: string };

export const RAMADAN_MAX_DAY_AMOUNT = 10_000;

export function buildRamadanPlan(input: RamadanPlanInput, settings: RamadanPlanSettings, now: Date): RamadanPlanBuild {
  const allowed = new Set(settings.projectIds.map((id) => id.toLowerCase()));
  const projectIds = [...new Set((input.projectIds ?? []).map((id) => String(id).toLowerCase()))];
  if (!projectIds.length || projectIds.some((id) => !allowed.has(id))) return { ok: false, error: "PROJECT_NOT_OFFERED" };
  if (!Array.isArray(input.days) || !input.days.length || input.days.length > RAMADAN_DAYS) return { ok: false, error: "INVALID_DAYS" };
  if (input.days.some((d) => !Number.isFinite(d?.amount) || d.amount < 1 || d.amount > RAMADAN_MAX_DAY_AMOUNT)) return { ok: false, error: "INVALID_AMOUNT" };
  const place = Number.isFinite(input.lat) && Number.isFinite(input.lng) ? { lat: input.lat as number, lng: input.lng as number } : ZONE_CITIES[input.timezone] ?? ZONE_CITIES["Europe/Istanbul"];
  const rule = parseRamadanRule({ kind: "ramadan", hijriYear: settings.hijriYear, days: input.days, slot: input.slot, lat: place.lat, lng: place.lng });
  if (!rule) return { ok: false, error: "INVALID_SCHEDULE" };
  const first = nextRamadanCharge(rule, settings.startDate, now);
  if (!first) return { ok: false, error: "RAMADAN_OVER" };
  const intent = input.intent === "self" || input.intent === "parents" || input.intent === "other" ? input.intent : "self";
  const onBehalf = intent === "other" ? String(input.onBehalf ?? "").trim().slice(0, 80) || null : null;
  const parts = splitAmount(first.amount, projectIds.length);
  return {
    ok: true,
    rule: { ...rule, projectIds, intent, onBehalf, remind: input.remind === true },
    first,
    firstItems: projectIds.map((campaignId, i) => ({ campaignId, amount: parts[i] })),
    total: ramadanTotal(rule),
  };
}
