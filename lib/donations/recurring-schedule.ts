/**
 * The recurring-donation contract, as pure functions.
 *
 * `RECURRING_DONATION_FLOW_MAP.md` fixes the vocabulary: the cart stores a
 * `freqKey` (`once | daily | friday | monthly`), and everything outside the
 * cart speaks `donationMode` / `frequency`. Here that becomes one order type on
 * the wire — `ONE_TIME | DAILY | FRIDAY | MONTHLY` — and a `RecurringFrequency`
 * on the plan. It used to be `ONE_TIME | MONTHLY`, with every recurring choice
 * collapsed to MONTHLY on the server while the donor was shown "daily" or
 * "every Friday" (`DEPLOYED_VS_DESIGN_AUDIT.md` § P0.2). The contract tests in
 * `tests/integration-settings/recurring-schedule.test.ts` pin the mapping.
 *
 * Two rails bill plans, and the cadence picks the rail (`railForFrequency`):
 *   - STRIPE keeps exactly its historical scope — one-time gifts and MONTHLY
 *     plans as Stripe Subscriptions. Stripe bills the cycle itself.
 *   - ALBARAKA bills DAILY and FRIDAY plans (and MONTHLY when it is the main
 *     gateway): the first instalment is a normal 3D payment at checkout, and
 *     every later one is charged by the site's own scheduler
 *     (`lib/donations/albaraka-recurring.ts`) at `nextChargeAt`, through the
 *     bank's direct /Sale as a recurring transaction.
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
/** The cart's own storage key — see `lib/minbar/cart.ts`. */
export type CartFreqKeyLike = "once" | "daily" | "friday" | "monthly";
/** The rails that can bill a plan. */
export type RecurringRail = "STRIPE" | "ALBARAKA";

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
 * Which rail bills a plan of this cadence.
 *
 * Stripe is kept to what it always did here — one-time and monthly. Daily
 * and Friday plans go to Albaraka whatever the admin's main gateway is,
 * because that is the rail whose recurring transactions the site schedules
 * itself. A monthly plan follows the main gateway.
 */
export function railForFrequency(frequency: RecurringFrequency, mainGateway: RecurringRail): RecurringRail {
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

export type ScheduleRule =
  | { kind: "daily" }
  | { kind: "weekday"; weekday: 5; hour: number }
  | { kind: "monthDay"; day: number };

/** The rule a plan created at `at` in `timezone` follows, as structure. */
export function scheduleRuleFor(frequency: RecurringFrequency, at: Date, timezone: string): ScheduleRule {
  switch (frequency) {
    case "DAILY":
      return { kind: "daily" };
    case "FRIDAY":
      return { kind: "weekday", weekday: FRIDAY, hour: FRIDAY_CHARGE_HOUR };
    case "MONTHLY":
      return { kind: "monthDay", day: wallClock(at, timezone).day };
  }
}

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

// ── Retry ladder (Albaraka scheduler) ───────────────────────────────────────

/**
 * Hours after a declined scheduler charge at which it is retried, in order.
 * `DONATION_LOGIC_SPEC` § 1.3 names 1h, 6h, 24h and says the count and
 * spacing are configuration, not a fixed decision — so `RECURRING_RETRY_HOURS`
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
  /** ISO — the next-charge date the checkout displayed. */
  nextChargeAt: string;
  /** The rail the plan was created for. */
  rail: RecurringRail;
  locale: string | null;
  /** ISO — when the donor confirmed. */
  acceptedAt: string;
}

export function consentSnapshotFor(input: {
  frequency: RecurringFrequency;
  amount: number;
  currency: string;
  timezone: string;
  rail: RecurringRail;
  locale: string | null;
  now: Date;
}): ConsentSnapshot {
  return {
    frequency: input.frequency,
    amount: input.amount,
    currency: input.currency,
    timezone: input.timezone,
    nextChargeAt: nextChargeAt(input.frequency, input.now, input.timezone).toISOString(),
    rail: input.rail,
    locale: input.locale,
    acceptedAt: input.now.toISOString(),
  };
}
