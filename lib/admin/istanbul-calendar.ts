const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

const dateTimePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ISTANBUL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getIstanbulParts(date: Date) {
  const parts = dateTimePartsFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function parseDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getIstanbulOffsetMs(date: Date) {
  const parts = getIstanbulParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds()
  );

  return asUtc - date.getTime();
}

function istanbulDateTimeToUtc(dateKey: string, hour = 0, minute = 0, second = 0, ms = 0) {
  const { year, month, day } = parseDateKey(dateKey);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  const firstOffset = getIstanbulOffsetMs(utcGuess);
  let utcDate = new Date(utcGuess.getTime() - firstOffset);
  const finalOffset = getIstanbulOffsetMs(utcDate);

  if (finalOffset !== firstOffset) {
    utcDate = new Date(utcGuess.getTime() - finalOffset);
  }

  return utcDate;
}

export function formatIstanbulDateKey(date: Date) {
  const parts = getIstanbulParts(date);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function addIstanbulCalendarDays(dateKey: string, days: number) {
  const { year, month, day } = parseDateKey(dateKey);
  return formatUtcDateKey(new Date(Date.UTC(year, month - 1, day + days)));
}

/**
 * Convert a YYYY-MM-DD start/end pair in the Istanbul calendar to a UTC
 * `Date` range usable in Prisma `createdAt: { gte, lte }` filters.
 *
 * The dashboard filter UI emits Istanbul date keys ("the day flips at 00:00
 * in Turkey"), but legacy endpoints used to append `T00:00:00.000Z` and feed
 * the result to Prisma — that interprets the same string as UTC midnight, so
 * the first 3 hours of every Istanbul day landed in the previous day's bucket
 * and the last donations of yesterday landed in today's. This helper closes
 * that gap so stats/list/export endpoints agree with the chart.
 */
export function istanbulDateKeysToUtcRange(startKey: string, endKey: string) {
  return {
    startDate: istanbulDateTimeToUtc(startKey),
    endDate: new Date(
      istanbulDateTimeToUtc(addIstanbulCalendarDays(endKey, 1)).getTime() - 1
    ),
  };
}

function addIstanbulCalendarYears(dateKey: string, years: number) {
  const { year, month, day } = parseDateKey(dateKey);
  return formatUtcDateKey(new Date(Date.UTC(year + years, month - 1, day)));
}

export function getIstanbulDateRange(
  period: string,
  startParam?: string | null,
  endParam?: string | null,
  now: Date = new Date()
) {
  const endDateKey = endParam || formatIstanbulDateKey(now);
  let startDateKey: string;

  if (startParam && endParam) {
    startDateKey = startParam;
  } else if (period === "all") {
    startDateKey = addIstanbulCalendarYears(endDateKey, -10);
  } else {
    const days = period === "day" ? 1 : period === "week" ? 7 : 30;
    startDateKey = startParam || addIstanbulCalendarDays(endDateKey, -days);
  }

  return {
    startDate: istanbulDateTimeToUtc(startDateKey),
    endDate: new Date(istanbulDateTimeToUtc(addIstanbulCalendarDays(endDateKey, 1)).getTime() - 1),
    startDateKey,
    endDateKey,
  };
}

export function eachIstanbulDateKey(startDateKey: string, endDateKey: string) {
  const keys: string[] = [];

  for (
    let currentDateKey = startDateKey;
    currentDateKey <= endDateKey;
    currentDateKey = addIstanbulCalendarDays(currentDateKey, 1)
  ) {
    keys.push(currentDateKey);
  }

  return keys;
}
