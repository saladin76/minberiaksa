/**
 * Friday prayer-linked recurring charges (DONATION_LOGIC_SPEC §1.3).
 * A Friday plan charges 30 minutes before the calculated Dhuhr time at the
 * donor-selected location. This is a Diyanet METHOD-13 calculation from
 * AlAdhan, NOT a promise to match a specific mosque's Jumu'ah iqama.
 *
 * Never guess an hour, timezone or location if the provider fails.
 * Both checkout previews and the payment scheduler call this same resolver.
 * The only outbound host is the fixed api.aladhan.com; coordinates are validated.
 */
import {
  fromWallClock,
  normalizeTimezone,
  wallClock,
  type PrayerScheduleRule,
  firstChargeForPlan,
  isPrayerScheduleRule,
} from "./recurring-schedule";

export const PRAYER_TIME_SOURCE = "AlAdhan/v1 method=13 (Diyanet)";
export const PRAYER_LEAD_MINUTES = 30;
const FRIDAY = 5;

function validatedTimezone(value: string): string {
  if (!value || normalizeTimezone(value, "") !== value) throw new Error("PRAYER_TIMEZONE_REQUIRED");
  return value;
}

export async function prayerTimeForDate(
  day: Date,
  rule: PrayerScheduleRule,
  timezone: string,
  fetcher: typeof fetch = fetch
): Promise<{ hour: number; minute: number }> {
  const tz = validatedTimezone(timezone);
  if (!Number.isFinite(rule.latitude) || !Number.isFinite(rule.longitude) ||
      rule.latitude < -90 || rule.latitude > 90 || rule.longitude < -180 || rule.longitude > 180) {
    throw new Error("PRAYER_LOCATION_REQUIRED");
  }
  const dd = String(day.getUTCDate()).padStart(2, "0");
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = day.getUTCFullYear();
  const url = new URL(`https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}`);
  url.searchParams.set("latitude", String(rule.latitude));
  url.searchParams.set("longitude", String(rule.longitude));
  url.searchParams.set("timezonestring", tz);
  url.searchParams.set("method", String(rule.method));
  url.searchParams.set("school", "0");
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new Error("PRAYER_PROVIDER_UNAVAILABLE");
  }
  if (!response.ok) throw new Error("PRAYER_PROVIDER_UNAVAILABLE");
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error("PRAYER_PROVIDER_INVALID"); }
  if (!data || typeof data !== "object") throw new Error("PRAYER_PROVIDER_INVALID");
  const payload = data as { code?: number; data?: { timings?: Record<string, unknown>; meta?: { timezone?: string } } };
  if (payload.code !== 200 || !payload.data?.timings) throw new Error("PRAYER_PROVIDER_INVALID");
  // Do not interpret a provider time in the wrong timezone.
  if (payload.data.meta?.timezone && payload.data.meta.timezone !== tz) throw new Error("PRAYER_PROVIDER_TIMEZONE_MISMATCH");
  const raw = payload.data.timings[rule.prayer];
  const match = typeof raw === "string" ? /^(\d{1,2}):(\d{2})(?:\s+\([^)]*\))?$/.exec(raw) : null;
  if (!match) throw new Error("PRAYER_PROVIDER_INVALID");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("PRAYER_PROVIDER_INVALID");
  return { hour, minute };
}

/** Next Friday occurrence strictly AFTER 'from', resolved on each call. */
export async function nextPrayerChargeFromRule(
  rule: PrayerScheduleRule,
  from: Date,
  timezone: string,
  fetcher: typeof fetch = fetch
): Promise<Date> {
  const tz = validatedTimezone(timezone);
  if (!Number.isFinite(from.getTime())) throw new Error("INVALID_CHARGE_DATE");
  const wall = wallClock(from, tz);
  for (let ahead = 0; ahead < 15; ahead += 1) {
    const day = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + ahead));
    if (day.getUTCDay() !== FRIDAY) continue;
    const prayer = await prayerTimeForDate(day, rule, tz, fetcher);
    const time = fromWallClock({
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      hour: prayer.hour,
      minute: prayer.minute,
      second: 0,
    }, tz);
    const charge = new Date(time.getTime() - rule.minutesBefore * 60_000);
    if (wallClock(charge, tz).weekday !== FRIDAY) throw new Error("PRAYER_RULE_OUTSIDE_FRIDAY");
    if (charge.getTime() > from.getTime()) return charge;
  }
  throw new Error("PRAYER_NEXT_OCCURRENCE_UNAVAILABLE");
}

/** Checkout already pays for its Friday, even before the calculated time. */
export async function firstPrayerChargeAfterCheckout(
  rule: PrayerScheduleRule,
  paidAt: Date,
  timezone: string,
  fetcher: typeof fetch = fetch
): Promise<Date> {
  const tz = validatedTimezone(timezone);
  const wall = wallClock(paidAt, tz);
  if (wall.weekday !== FRIDAY) return nextPrayerChargeFromRule(rule, paidAt, tz, fetcher);
  const followingDay = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
  return nextPrayerChargeFromRule(rule, fromWallClock({
    year: followingDay.getUTCFullYear(), month: followingDay.getUTCMonth() + 1,
    day: followingDay.getUTCDate(), hour: 0, minute: 0, second: 0,
  }, tz), tz, fetcher);
}

/** No follow-up charge may be attempted without a resolvable next cycle. */
export async function nextChargeForStoredPlan(
  plan: { frequency: string; scheduleRule?: unknown; timezone?: string | null },
  from: Date,
  fetcher: typeof fetch = fetch
): Promise<Date> {
  const { isPrayerScheduleRule, nextChargeForPlan } = await import("./recurring-schedule");
  if (plan.scheduleRule && typeof plan.scheduleRule === "object" && (plan.scheduleRule as { kind?: unknown }).kind === "prayer" && !isPrayerScheduleRule(plan.scheduleRule)) throw new Error("PRAYER_RULE_INVALID");
  if (isPrayerScheduleRule(plan.scheduleRule)) {
    if (plan.frequency !== "FRIDAY") throw new Error("PRAYER_FREQUENCY_MISMATCH");
    return nextPrayerChargeFromRule(plan.scheduleRule, from, validatedTimezone(plan.timezone || ""), fetcher);
  }
  return nextChargeForPlan(plan, from);
}


/**
 * Settle a confirmed FIRST instalment without calling an external prayer API
 * in the database transaction. Checkout already stored the verified next
 * prayer charge. If the first payment is captured on that Friday, skip its
 * remainder: it is the instalment the donor has JUST paid.
 *
 * Every returned prayer date is provisional: the renewal scheduler re-reads
 * the actual Dhuhr time before contacting the provider. If the original
 * verified date is missing, corrupt or too old, pause the plan for review,
 * but NEVER roll back recording money the provider has already collected.
 */
export function firstChargeForSettledPlan(
  plan: { frequency: string; scheduleRule?: unknown; timezone?: string | null; nextBillingDate?: Date | null },
  paidAt: Date,
): Date | null {
  const candidate = plan.scheduleRule;
  if (!(candidate && typeof candidate === "object" && (candidate as { kind?: unknown }).kind === "prayer")) {
    return firstChargeForPlan(plan, paidAt);
  }
  if (!isPrayerScheduleRule(candidate) || plan.frequency !== "FRIDAY") return null;
  const timezone = plan.timezone;
  if (!timezone || normalizeTimezone(timezone, "") !== timezone) return null;
  const due = plan.nextBillingDate;
  if (!(due instanceof Date) || !Number.isFinite(due.getTime()) || !Number.isFinite(paidAt.getTime())) return null;
  const settledWall = wallClock(paidAt, timezone);
  let next = new Date(due.getTime());
  if (wallClock(next, timezone).weekday !== FRIDAY) return null;
  for (let i = 0; i < 520; i += 1) {
    const nextWall = wallClock(next, timezone);
    const alreadyPaidThisFriday = settledWall.weekday === FRIDAY &&
      settledWall.year === nextWall.year && settledWall.month === nextWall.month && settledWall.day === nextWall.day;
    if (next.getTime() > paidAt.getTime() && !alreadyPaidThisFriday) return next;
    next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return null;
}
