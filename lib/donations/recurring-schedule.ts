/**
 * The recurring-donation contract, as pure functions.
 *
 * `RECURRING_DONATION_FLOW_MAP.md` fixes the vocabulary: the cart stores a
 * `freqKey` (`once | daily | friday | monthly`), and everything outside the
 * cart speaks `donationMode` / `frequency`. Here that becomes one order type on
 * the wire  `ONE_TIME | DAILY | FRIDAY | MONTHLY`  and a `RecurringFrequency`
 * on the plan. It used to be `ONE_TIME | MONTHLY`, with every recurring choice
 * collapsed to MONTHLY on the server while the donor was shown "daily" or
 * "every Friday" (`DEPLOYED_VS_DESIGN_AUDIT.md` § P0.2). The contract tests in
 * `tests/integration-settings/recurring-schedule.test.ts` pin the mapping.
 *
 * Two rails bill plans, and the cadence picks the rail (`railForFrequency`):
 *   - STRIPE keeps exactly its historical scope  one-time gifts and MONTHLY
 *     plans as Stripe Subscriptions. Stripe bills the cycle itself.
 *   - ALBARAKA bills DAILY and FRIDAY plans (and MONTHLY when it is the main
 *     gateway): the first instalment is a normal 3D payment at checkout, and
 *     every later one is charged by the site's own scheduler
 *     (`lib/donations/albaraka-recurring.ts`) at `nextChargeAt`, through the
 *     bank's direct /Sale as a recurring transaction.
 *   - PAYPAL bills every cadence of a plan the donor paid with PayPal: the
 *     first instalment is a PayPal checkout that also saves (vaults) the
 *     wallet, and the same scheduler charges later ones against it
 *     (`lib/donations/paypal-recurring.ts`). The payment method picks this
 *     rail, not the cadence  `railForFrequency` is for card plans only.
 *
 * Time is handled per `DONATION_LOGIC_SPEC` § Recurring Time Contract: every
 * plan keeps an IANA timezone, the rule as structure, and a `nextChargeAt`
 * computed by the server in that zone. Nothing here stores an offset, so a
 * plan in Istanbul or New York keeps its Friday when the clocks change.
 *
 * Deliberately dependency-free (no Prisma, no Stripe types): it is imported
 * by the browser checkout to show the next charge date before the donor
 * confirms, by the API routes and the scheduler, and by the build-time tests.
 */

export type RecurringFrequency = "DAILY" | "FRIDAY" | "MONTHLY";
export type OrderType = "ONE_TIME" | RecurringFrequency;
/** The cart's own storage key  see `lib/minbar/cart.ts`. */
export type CartFreqKeyLike = "once" | "daily" | "friday" | "monthly";
/** The rails that can bill a card plan. */
export type CardRail = "STRIPE" | "ALBARAKA";
/** The rails that can bill a plan. */
export type RecurringRail = CardRail | "PAYPAL";

export const RECURRING_FREQUENCIES: readonly RecurringFrequency[] = ["DAILY", "FRIDAY", "MONTHLY"];
export const ORDER_TYPES: readonly OrderType[] = ["ONE_TIME", ...RECURRING_FREQUENCIES];

/**
 * Local hour at which a Friday plan is charged. Mid-morning, ahead of Jumu'ah:
 * the charge lands on the day the donor asked for, in their own clock, and
 * before the hour most people associate with it. A prayer-time-linked charge
 * (`DONATION_LOGIC_SPEC` § 1.3) would replace this constant with a resolved
 * time; it is not implemented, and no UI promises it.
 */
export const FRIDAY_CHARGE_HOUR = 9;

/** ISO weekday of Friday as `Date#getUTCDay()` counts it. */
const FRIDAY = 5;

export function isRecurringFrequency(value: unknown): value is RecurringFrequency {
  return typeof value === "string" && (RECURRING_FREQUENCIES as readonly string[]).includes(value);
}

export function isOrderType(value: unknown): value is OrderType {
  return typeof value === "string" && (ORDER_TYPES as readonly string[]).includes(value);
}

/** `once → ONE_TIME`, `daily → DAILY`, `friday → FRIDAY`, `monthly → MONTHLY`. */
export function orderTypeForFreqKey(key: CartFreqKeyLike): OrderType {
  switch (key) {
    case "daily":
      return "DAILY";
    case "friday":
      return "FRIDAY";
    case "monthly":
      return "MONTHLY";
    default:
      return "ONE_TIME";
  }
}

/**
 * The one type an order carries. A basket with any recurring row is a plan at
 * that row's cadence; the cart page does not let cadences mix, and if two ever
 * did the first recurring row wins rather than the order failing.
 */
export function orderTypeForItems(items: ReadonlyArray<{ freqKey: CartFreqKeyLike }>): OrderType {
  const recurring = items.find((item) => item.freqKey !== "once");
  return recurring ? orderTypeForFreqKey(recurring.freqKey) : "ONE_TIME";
}

export function frequencyOfOrderType(type: OrderType): RecurringFrequency | null {
  return type === "ONE_TIME" ? null : type;
}

/** The `common.*` message key for a frequency's label. */
export function frequencyLabelKey(frequency: RecurringFrequency): "freqDaily" | "freqFriday" | "freqMonthly" {
  return frequency === "DAILY" ? "freqDaily" : frequency === "FRIDAY" ? "freqFriday" : "freqMonthly";
}

/**
 * Average charges per month for a cadence  a Julian year (365.25 days) split
 * into twelve, so a daily plan is ≈30.44 charges and a Friday plan ≈4.35.
 * Dashboards multiply a plan's per-charge amount by this to put every cadence
 * on the one monthly scale MRR is quoted in; summing raw amounts would count a
 * $1/day plan as $1 a month.
 */
export function chargesPerMonth(frequency: RecurringFrequency): number {
  return frequency === "DAILY" ? 365.25 / 12 : frequency === "FRIDAY" ? 365.25 / 7 / 12 : 1;
}

/**
 * Which rail bills a plan of this cadence.
 *
 * Stripe is kept to what it always did here  one-time and monthly. Daily
 * and Friday plans go to Albaraka whatever the admin's main gateway is,
 * because that is the rail whose recurring transactions the site schedules
 * itself. A monthly plan follows the main gateway.
 */
export function railForFrequency(frequency: RecurringFrequency, mainGateway: CardRail): CardRail {
  return frequency === "MONTHLY" ? mainGateway : "ALBARAKA";
}

/** A valid IANA zone, or the fallback. Never trust a browser string unchecked. */
export function normalizeTimezone(value: unknown, fallback = "UTC"): string {
  if (typeof value !== "string" || !value.trim() || value.length > 64) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return fallback;
  }
}

/**
 * A plan's schedule, as structure, in its own timezone. `hour`/`minute` are
 * the wall-clock time of every charge. Plans created before the donor could
 * choose a time stored `{ kind: "daily" }` / `{ kind: "monthDay", day }`
 * without one; those keep their old cadence through `nextChargeAt` (see
 * `nextChargeForPlan`).
 */
export type ScheduleRule =
  | { kind: "daily"; hour?: number; minute?: number }
  | { kind: "weekday"; weekday: 5; hour: number; minute?: number }
  | { kind: "monthDay"; day: number; hour?: number; minute?: number }
  | PrayerScheduleRule;

/** Friday before Dhuhr calculated in the donor-selected geographic location. */
export type PrayerScheduleRule = { kind: "prayer"; weekday: 5; prayer: "Dhuhr"; latitude: number; longitude: number; method: 13; minutesBefore: 30 };
export function isPrayerScheduleRule(value: unknown): value is PrayerScheduleRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return r.kind === "prayer" && r.weekday === 5 && r.prayer === "Dhuhr" && r.method === 13 && r.minutesBefore === 30 && typeof r.latitude === "number" && Number.isFinite(r.latitude) && Math.abs(r.latitude) <= 90 && typeof r.longitude === "number" && Number.isFinite(r.longitude) && Math.abs(r.longitude) <= 180;
}

/** What the donor chose on the recurring page: a day (monthly only) and a local time. */
export interface LocalRecurringScheduleChoice {
  /** 1–28, so every month has it. Monthly plans only. */
  dayOfMonth?: number;
  hour: number;
  minute: number;
  /** Free text the donor attached to the schedule. Kept on the consent record. */
  notes?: string;
}
export type RecurringScheduleChoice = LocalRecurringScheduleChoice | { mode: "prayer"; prayer: "Dhuhr"; latitude: number; longitude: number; notes?: string };

export const MAX_SCHEDULE_NOTES = 500;

const isIntIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/**
 * Validate a schedule choice from the browser. Absent is fine (`value: null`
 *  the plan is then scheduled from its creation time, as before); present but
 * malformed is an error, never silently replaced by a different schedule.
 */
export function parseScheduleChoice(
  value: unknown
): { ok: true; value: RecurringScheduleChoice | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Invalid schedule" };
  const o = value as Record<string, unknown>;
  if (o.mode === "prayer") {
    if (o.prayer !== "Dhuhr" || typeof o.latitude !== "number" || !Number.isFinite(o.latitude) || Math.abs(o.latitude) > 90 || typeof o.longitude !== "number" || !Number.isFinite(o.longitude) || Math.abs(o.longitude) > 180 || o.dayOfMonth !== undefined || o.hour !== undefined || o.minute !== undefined) return { ok: false, error: "Invalid Friday prayer schedule or location" };
    if (o.notes !== undefined && typeof o.notes !== "string") return { ok: false, error: "Invalid schedule notes" };
    return { ok: true, value: { mode: "prayer", prayer: "Dhuhr", latitude: o.latitude, longitude: o.longitude, ...(typeof o.notes === "string" && o.notes.trim() ? { notes: o.notes.trim().slice(0, MAX_SCHEDULE_NOTES) } : {}) } };
  }
  if (o.mode !== undefined && o.mode !== "local") return { ok: false, error: "Invalid schedule mode" };
  if (!isIntIn(o.hour, 0, 23) || !isIntIn(o.minute, 0, 59)) return { ok: false, error: "Schedule time must be a valid hour (0–23) and minute (0–59)" };
  if (o.dayOfMonth !== undefined && o.dayOfMonth !== null && !isIntIn(o.dayOfMonth, 1, 28)) {
    return { ok: false, error: "Schedule day of month must be between 1 and 28" };
  }
  if (o.notes !== undefined && o.notes !== null && typeof o.notes !== "string") return { ok: false, error: "Invalid schedule notes" };
  const notes = typeof o.notes === "string" ? o.notes.trim().slice(0, MAX_SCHEDULE_NOTES) : "";
  return {
    ok: true,
    value: {
      hour: o.hour,
      minute: o.minute,
      ...(isIntIn(o.dayOfMonth, 1, 28) ? { dayOfMonth: o.dayOfMonth } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

/**
 * The rule a plan follows: the donor's chosen day and time when there is a
 * choice, otherwise the creation moment's (the Friday default stays
 * `FRIDAY_CHARGE_HOUR`). A monthly plan with no chosen day keeps the creation
 * day  e.g. a cart row switched to monthly after the recurring page.
 */
export function scheduleRuleFor(
  frequency: RecurringFrequency,
  at: Date,
  timezone: string,
  choice: RecurringScheduleChoice | null = null
): ScheduleRule {
  if (choice?.mode === "prayer") {
    if (frequency !== "FRIDAY") throw new Error("PRAYER_FREQUENCY_MISMATCH");
    return { kind: "prayer", weekday: 5, prayer: "Dhuhr", latitude: choice.latitude, longitude: choice.longitude, method: 13, minutesBefore: 30 };
  }
  const local = choice && choice.mode !== "prayer" ? choice : null;
  const wall = wallClock(at, normalizeTimezone(timezone));
  switch (frequency) {
    case "DAILY":
      return { kind: "daily", hour: local?.hour ?? wall.hour, minute: local?.minute ?? wall.minute };
    case "FRIDAY":
      return { kind: "weekday", weekday: FRIDAY, hour: local?.hour ?? FRIDAY_CHARGE_HOUR, minute: local?.minute ?? 0 };
    case "MONTHLY":
      return { kind: "monthDay", day: local?.dayOfMonth ?? wall.day, hour: local?.hour ?? wall.hour, minute: local?.minute ?? wall.minute };
  }
}

/** A stored `scheduleRule` JSON, if it is one this module understands. */
export function parseScheduleRule(value: unknown): ScheduleRule | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.kind === "prayer") return isPrayerScheduleRule(value) ? value : null;
  const time = {
    ...(isIntIn(o.hour, 0, 23) ? { hour: o.hour } : {}),
    ...(isIntIn(o.minute, 0, 59) ? { minute: o.minute } : {}),
  };
  if (o.kind === "daily") return { kind: "daily", ...time };
  if (o.kind === "weekday" && o.weekday === FRIDAY) return { kind: "weekday", weekday: FRIDAY, hour: time.hour ?? FRIDAY_CHARGE_HOUR, ...(time.minute !== undefined ? { minute: time.minute } : {}) };
  if (o.kind === "monthDay" && isIntIn(o.day, 1, 31)) return { kind: "monthDay", day: o.day, ...time };
  return null;
}

const RULE_KIND: Record<RecurringFrequency, ScheduleRule["kind"]> = { DAILY: "daily", FRIDAY: "weekday", MONTHLY: "monthDay" };

// ── Zoned time ──────────────────────────────────────────────────────────────

interface WallClock {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timezone, f);
  }
  return f;
}

/** The wall-clock reading of an instant in a zone. */
export function wallClock(date: Date, timezone: string): WallClock {
  const parts = formatter(timezone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // `hourCycle: "h23"` still yields "24" at midnight in some engines.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

const asUtc = (w: Omit<WallClock, "weekday">) =>
  Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

/**
 * The instant at which a zone's clocks read `wall`. Iterates on the offset
 * so it is exact across a daylight-saving change; a reading that never
 * occurs (the skipped hour) resolves to the instant just after the gap.
 */
export function fromWallClock(wall: Omit<WallClock, "weekday">, timezone: string): Date {
  const target = asUtc(wall);
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const back = asUtc(wallClock(new Date(guess), timezone));
    const diff = back - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/** Same wall time, `days` calendar days later, in the zone. */
function addCalendarDays(wall: WallClock, days: number): Omit<WallClock, "weekday"> {
  const d = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: wall.hour, minute: wall.minute, second: wall.second };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * When the plan charges next, given the moment it was last charged (or
 * created), in the plan's own zone.
 *
 * - DAILY: the same wall time tomorrow.
 * - FRIDAY: the first Friday at `FRIDAY_CHARGE_HOUR` strictly after `from`.
 * - MONTHLY: the same day and wall time next month; a shorter month charges on
 *   its last day (`DONATION_LOGIC_SPEC` § الدوريات).
 */
export function nextChargeAt(frequency: RecurringFrequency, from: Date, timezone: string): Date {
  const tz = normalizeTimezone(timezone);
  const wall = wallClock(from, tz);

  switch (frequency) {
    case "DAILY":
      return fromWallClock(addCalendarDays(wall, 1), tz);

    case "FRIDAY": {
      for (let offset = 0; offset < 8; offset += 1) {
        const day = addCalendarDays(wall, offset);
        const candidate = fromWallClock({ ...day, hour: FRIDAY_CHARGE_HOUR, minute: 0, second: 0 }, tz);
        if (wallClock(candidate, tz).weekday === FRIDAY && candidate.getTime() > from.getTime()) return candidate;
      }
      /* Unreachable: eight consecutive days contain a Friday. */
      throw new Error("nextChargeAt: no Friday found");
    }

    case "MONTHLY": {
      const month = wall.month === 12 ? 1 : wall.month + 1;
      const year = wall.month === 12 ? wall.year + 1 : wall.year;
      const day = Math.min(wall.day, daysInMonth(year, month));
      return fromWallClock({ year, month, day, hour: wall.hour, minute: wall.minute, second: wall.second }, tz);
    }
  }
}

/**
 * The first moment strictly after `from` at which `rule` charges, in the
 * plan's zone. A rule stored without a time (plans from before the donor
 * could choose one) falls back to `nextChargeAt`'s same-wall-time cadence.
 * A month shorter than `rule.day` charges on its last day.
 */
export function nextChargeFromRule(rule: ScheduleRule, from: Date, timezone: string): Date {
  const tz = normalizeTimezone(timezone);
  if (rule.kind === "prayer") throw new Error("PRAYER_SCHEDULE_REQUIRES_ASYNC_RESOLUTION");
  if (rule.hour === undefined) return nextChargeAt(rule.kind === "daily" ? "DAILY" : "MONTHLY", from, tz);
  const at = { hour: rule.hour, minute: rule.minute ?? 0, second: 0 };
  const wall = wallClock(from, tz);

  switch (rule.kind) {
    case "daily":
      for (let offset = 0; offset < 3; offset += 1) {
        const candidate = fromWallClock({ ...addCalendarDays(wall, offset), ...at }, tz);
        if (candidate.getTime() > from.getTime()) return candidate;
      }
      break;

    case "weekday":
      for (let offset = 0; offset < 9; offset += 1) {
        const candidate = fromWallClock({ ...addCalendarDays(wall, offset), ...at }, tz);
        if (wallClock(candidate, tz).weekday === rule.weekday && candidate.getTime() > from.getTime()) return candidate;
      }
      break;

    case "monthDay":
      for (let ahead = 0; ahead < 3; ahead += 1) {
        const index = wall.month - 1 + ahead;
        const year = wall.year + Math.floor(index / 12);
        const month = (index % 12) + 1;
        const candidate = fromWallClock({ year, month, day: Math.min(rule.day, daysInMonth(year, month)), ...at }, tz);
        if (candidate.getTime() > from.getTime()) return candidate;
      }
      break;
  }
  /* Unreachable: each loop spans more than one full period. */
  throw new Error(`nextChargeFromRule: no occurrence found for ${rule.kind}`);
}

/** Whether two instants fall in the same billing period of a rule: the same local day, or the same local month for a monthly plan. */
function samePeriod(rule: ScheduleRule, a: Date, b: Date, tz: string): boolean {
  const x = wallClock(a, tz);
  const y = wallClock(b, tz);
  if (x.year !== y.year || x.month !== y.month) return false;
  return rule.kind === "monthDay" || x.day === y.day;
}

/**
 * The first scheduled charge after the checkout payment at `paidAt`. That
 * payment is the current period's gift, so the schedule starts in the next
 * period: a monthly plan for the 15th paid on the 4th next charges on the 15th
 * of NEXT month, and a daily plan paid at 10:00 for 14:30 next charges
 * tomorrow  never twice in one day or month. A Friday plan paid on a
 * Thursday still charges the next day: that is a different Friday's gift.
 */
export function firstChargeAfterCheckout(rule: ScheduleRule, paidAt: Date, timezone: string): Date {
  const tz = normalizeTimezone(timezone);
  let next = nextChargeFromRule(rule, paidAt, tz);
  if (rule.kind === "prayer") throw new Error("PRAYER_SCHEDULE_REQUIRES_ASYNC_RESOLUTION");
  if (rule.hour === undefined) return next; // legacy rules already skip the current period
  for (let guard = 0; guard < 3 && samePeriod(rule, next, paidAt, tz); guard += 1) {
    next = nextChargeFromRule(rule, next, tz);
  }
  return next;
}

/**
 * A plan's own rule, when it has a usable one matching its cadence. A plan
 * whose frequency was changed without a new rule, or with no rule at all,
 * gets `null` and callers use the frequency-only `nextChargeAt`.
 */
export function planRule(plan: { frequency: string; scheduleRule?: unknown }): ScheduleRule | null {
  if (!isRecurringFrequency(plan.frequency)) return null;
  const rule = parseScheduleRule(plan.scheduleRule);
  return rule && (rule.kind === RULE_KIND[plan.frequency] || (plan.frequency === "FRIDAY" && rule.kind === "prayer")) ? rule : null;
}

/**
 * The next charge of a stored plan strictly after `from`: from its rule when
 * it has one, so every cycle lands on the donor's chosen day and time (a
 * retried charge does not drag later cycles off it), else by frequency.
 */
export function nextChargeForPlan(plan: { frequency: string; scheduleRule?: unknown; timezone?: string | null }, from: Date): Date {
  const tz = normalizeTimezone(plan.timezone);
  const rule = planRule(plan);
  if (rule?.kind === "prayer") throw new Error("PRAYER_SCHEDULE_REQUIRES_ASYNC_RESOLUTION");
  if (rule) return nextChargeFromRule(rule, from, tz);
  return nextChargeAt(isRecurringFrequency(plan.frequency) ? plan.frequency : "MONTHLY", from, tz);
}

/** The first scheduled charge of a stored plan after its checkout payment  see `firstChargeAfterCheckout`. */
export function firstChargeForPlan(plan: { frequency: string; scheduleRule?: unknown; timezone?: string | null }, paidAt: Date): Date {
  const tz = normalizeTimezone(plan.timezone);
  const rule = planRule(plan);
  if (rule?.kind === "prayer") throw new Error("PRAYER_SCHEDULE_REQUIRES_ASYNC_RESOLUTION");
  if (rule) return firstChargeAfterCheckout(rule, paidAt, tz);
  return nextChargeAt(isRecurringFrequency(plan.frequency) ? plan.frequency : "MONTHLY", paidAt, tz);
}

// ── Retry ladder (Albaraka scheduler) ───────────────────────────────────────

/**
 * Hours after a declined scheduler charge at which it is retried, in order.
 * `DONATION_LOGIC_SPEC` § 1.3 names 1h, 6h, 24h and says the count and
 * spacing are configuration, not a fixed decision  so `RECURRING_RETRY_HOURS`
 * ("1,6,24") overrides the default. When the ladder is exhausted the plan is
 * set to PAYMENT_FAILED and the donor is told.
 */
export const DEFAULT_RETRY_HOURS: readonly number[] = [1, 6, 24];

export function retryLadderHours(raw: string | undefined = process.env.RECURRING_RETRY_HOURS): readonly number[] {
  if (!raw) return DEFAULT_RETRY_HOURS;
  const hours = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return hours.length ? hours : DEFAULT_RETRY_HOURS;
}

/**
 * When to retry after the `attempt`-th consecutive failure (1-based), or
 * `null` when the ladder is exhausted and the plan should stop.
 */
export function nextRetryAt(attempt: number, from: Date, ladder: readonly number[] = retryLadderHours()): Date | null {
  const hours = ladder[attempt - 1];
  if (hours === undefined) return null;
  return new Date(from.getTime() + hours * 3_600_000);
}

// ── Stripe ──────────────────────────────────────────────────────────────────

/**
 * The `price_data.recurring` block for a frequency. Only MONTHLY reaches
 * Stripe in practice (`railForFrequency`); the mapping stays total so a
 * caller cannot hand Stripe a cadence it has no interval for.
 */
export function stripeRecurringFor(frequency: RecurringFrequency): { interval: "day" | "week" | "month"; interval_count: 1 } {
  return { interval: frequency === "DAILY" ? "day" : frequency === "FRIDAY" ? "week" : "month", interval_count: 1 };
}

// ── Consent ─────────────────────────────────────────────────────────────────

/** The record of what the donor agreed to, written once onto the plan. */
export interface ConsentSnapshot {
  frequency: RecurringFrequency;
  amount: number;
  currency: string;
  timezone: string;
  /** The schedule the donor agreed to  the same rule stored on the plan. */
  schedule: ScheduleRule;
  /** ISO  the first scheduled charge, computed from `schedule`. */
  nextChargeAt: string;
  /** The donor's note on the schedule, if any. */
  notes: string | null;
  /** The rail the plan was created for. */
  rail: RecurringRail;
  locale: string | null;
  /** ISO  when the donor confirmed. */
  acceptedAt: string;
}

/**
 * Written once onto the plan. `schedule` and `nextChargeAt` come from the one
 * rule the plan stores, so the plan's `scheduleRule`, its first
 * `nextBillingDate` and this record cannot disagree.
 */
export function consentSnapshotFor(input: {
  frequency: RecurringFrequency;
  amount: number;
  currency: string;
  timezone: string;
  rail: RecurringRail;
  locale: string | null;
  now: Date;
  /** Defaults to the creation-time rule, as `scheduleRuleFor` builds it. */
  rule?: ScheduleRule;
  notes?: string | null;
}): ConsentSnapshot {
  const rule = input.rule ?? scheduleRuleFor(input.frequency, input.now, input.timezone);
  return {
    frequency: input.frequency,
    amount: input.amount,
    currency: input.currency,
    timezone: input.timezone,
    schedule: rule,
    nextChargeAt: firstChargeAfterCheckout(rule, input.now, input.timezone).toISOString(),
    notes: input.notes ?? null,
    rail: input.rail,
    locale: input.locale,
    acceptedAt: input.now.toISOString(),
  };
}
