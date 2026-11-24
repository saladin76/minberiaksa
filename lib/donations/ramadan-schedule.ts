/**
 * Ramadan scheduling, as pure functions (dependency-free, like recurring-schedule.ts).
 *
 * A Ramadan plan is an ALBARAKA recurring plan whose `scheduleRule` is
 * `{ kind: "ramadan", hijriYear, days: [{ day, amount }], slot, lat, lng }`:
 * the donor chooses Ramadan DAYS (1–30), an amount for each, and whether the
 * gift goes out after Fajr or before Maghrib in their own city. Days are kept
 * as Ramadan day numbers, never dates: the date of 1 Ramadan comes from the
 * dashboard setting and moves every plan when the moon sighting is announced.
 *
 * Prayer times: the standard solar computation (praytimes.org / NOAA terms),
 * Fajr at the sun 18° below the horizon, Maghrib at sunset (0.833°). No
 * library: the formulas are short, deterministic and tested here.
 */
export type RamadanSlot = "fajr" | "maghrib";
export type RamadanDay = { day: number; amount: number };
export type RamadanRule = { kind: "ramadan"; hijriYear: number; days: RamadanDay[]; slot: RamadanSlot; lat: number; lng: number };

/** Minutes after Fajr / before Maghrib at which the day's gift is charged. */
export const FAJR_CHARGE_OFFSET_MIN = 30;
export const MAGHRIB_CHARGE_OFFSET_MIN = 45;
export const RAMADAN_DAYS = 30;

const isFiniteIn = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

export function parseRamadanRule(value: unknown): RamadanRule | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.kind !== "ramadan" || !Number.isInteger(o.hijriYear) || (o.slot !== "fajr" && o.slot !== "maghrib")) return null;
  if (!isFiniteIn(o.lat, -90, 90) || !isFiniteIn(o.lng, -180, 180) || !Array.isArray(o.days)) return null;
  const seen = new Set<number>();
  const days: RamadanDay[] = [];
  for (const d of o.days as unknown[]) {
    const x = d as Record<string, unknown>;
    if (!x || !Number.isInteger(x.day) || !isFiniteIn(x.day, 1, RAMADAN_DAYS) || !isFiniteIn(x.amount, 0.01, 1_000_000) || seen.has(x.day as number)) return null;
    seen.add(x.day as number); days.push({ day: x.day as number, amount: Math.round((x.amount as number) * 100) / 100 });
  }
  if (!days.length) return null;
  days.sort((a, b) => a.day - b.day);
  return { kind: "ramadan", hijriYear: o.hijriYear as number, days, slot: o.slot, lat: o.lat as number, lng: o.lng as number };
}

/** `YYYY-MM-DD` of Ramadan day `n`, given the date of 1 Ramadan. */
export function ramadanDate(startYmd: string, n: number): string {
  const [y, m, d] = startYmd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n - 1));
  return t.toISOString().slice(0, 10);
}

const rad = (deg: number) => (deg * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
const fixAngle = (a: number) => a - 360 * Math.floor(a / 360), fixHour = (h: number) => h - 24 * Math.floor(h / 24);

/** Fajr and Maghrib (UTC instants) for a civil date at a place; null in polar cases. */
export function prayerTimesUtc(ymd: string, lat: number, lng: number): { fajr: Date; maghrib: Date } | null {
  const [y, m, d] = ymd.split("-").map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  const jd = midnight / 86_400_000 + 2440587.5 - lng / 360 + 0.5; // local noon, roughly
  const n = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * n), q = fixAngle(280.459 + 0.98564736 * n);
  const L = fixAngle(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)));
  const e = 23.439 - 0.00000036 * n;
  const ra = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15;
  const decl = deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L))));
  const eqt = q / 15 - fixHour(ra);
  const noon = 12 - lng / 15 - eqt; // UTC hours
  const hourAngle = (angle: number) => {
    const c = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    return Math.abs(c) > 1 ? null : deg(Math.acos(c)) / 15;
  };
  const tFajr = hourAngle(18), tSet = hourAngle(0.833);
  if (tFajr === null || tSet === null) return null;
  const at = (h: number) => new Date(midnight + Math.round(h * 3_600_000));
  return { fajr: at(noon - tFajr), maghrib: at(noon + tSet) };
}

/** When Ramadan day `n` is charged for this rule. Polar fallback: 09:00 / 15:00 UTC-ish via noon ± 3 h. */
export function ramadanChargeAt(rule: RamadanRule, startYmd: string, n: number): Date {
  const ymd = ramadanDate(startYmd, n);
  const t = prayerTimesUtc(ymd, rule.lat, rule.lng);
  if (rule.slot === "fajr") return t ? new Date(t.fajr.getTime() + FAJR_CHARGE_OFFSET_MIN * 60_000) : new Date(Date.parse(ymd + "T06:00:00Z") - (rule.lng / 15) * 3_600_000);
  return t ? new Date(t.maghrib.getTime() - MAGHRIB_CHARGE_OFFSET_MIN * 60_000) : new Date(Date.parse(ymd + "T15:00:00Z") - (rule.lng / 15) * 3_600_000);
}

/** The first scheduled day charged strictly after `after`; null once the plan is complete. */
export function nextRamadanCharge(rule: RamadanRule, startYmd: string, after: Date): { day: number; at: Date; amount: number } | null {
  for (const d of rule.days) {
    const at = ramadanChargeAt(rule, startYmd, d.day);
    if (at.getTime() > after.getTime()) return { day: d.day, at, amount: d.amount };
  }
  return null;
}

/** Splits a day's amount over the plan's projects to the cent; the parts always add up. */
export function splitAmount(amount: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const cents = Math.round(amount * 100), base = Math.floor(cents / n), rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
}

export function ramadanTotal(rule: Pick<RamadanRule, "days">): number {
  return Math.round(rule.days.reduce((t, d) => t + d.amount, 0) * 100) / 100;
}

/** A city for the donor's IANA zone when the browser gives nothing better (Arabic name for the UI). */
export const ZONE_CITIES: Record<string, { lat: number; lng: number; cityAr: string }> = {
  "Europe/Istanbul": { lat: 41.0082, lng: 28.9784, cityAr: "إسطنبول" },
  "Asia/Riyadh": { lat: 24.7136, lng: 46.6753, cityAr: "الرياض" },
  "Asia/Kuwait": { lat: 29.3759, lng: 47.9774, cityAr: "الكويت" },
  "Asia/Qatar": { lat: 25.2854, lng: 51.531, cityAr: "الدوحة" },
  "Asia/Dubai": { lat: 25.2048, lng: 55.2708, cityAr: "دبي" },
  "Asia/Bahrain": { lat: 26.2285, lng: 50.586, cityAr: "المنامة" },
  "Asia/Muscat": { lat: 23.588, lng: 58.3829, cityAr: "مسقط" },
  "Asia/Baghdad": { lat: 33.3152, lng: 44.3661, cityAr: "بغداد" },
  "Asia/Amman": { lat: 31.9454, lng: 35.9284, cityAr: "عمّان" },
  "Asia/Hebron": { lat: 31.5326, lng: 35.0998, cityAr: "الخليل" },
  "Asia/Gaza": { lat: 31.5017, lng: 34.4668, cityAr: "غزة" },
  "Asia/Jerusalem": { lat: 31.7683, lng: 35.2137, cityAr: "القدس" },
  "Africa/Cairo": { lat: 30.0444, lng: 31.2357, cityAr: "القاهرة" },
  "Africa/Casablanca": { lat: 33.5731, lng: -7.5898, cityAr: "الدار البيضاء" },
  "Africa/Algiers": { lat: 36.7538, lng: 3.0588, cityAr: "الجزائر" },
  "Africa/Tunis": { lat: 36.8065, lng: 10.1815, cityAr: "تونس" },
  "Europe/Berlin": { lat: 52.52, lng: 13.405, cityAr: "برلين" },
  "Europe/Paris": { lat: 48.8566, lng: 2.3522, cityAr: "باريس" },
  "Europe/London": { lat: 51.5072, lng: -0.1276, cityAr: "لندن" },
  "Europe/Amsterdam": { lat: 52.3676, lng: 4.9041, cityAr: "أمستردام" },
  "America/New_York": { lat: 40.7128, lng: -74.006, cityAr: "نيويورك" },
};
