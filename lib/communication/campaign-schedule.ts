import { fromWallClock, wallClock } from "../donations/recurring-schedule";
export const CAMPAIGN_SCHEDULE_ZONE = "Europe/Istanbul";
const pad = (n: number) => String(n).padStart(2, "0");
export function campaignLocalTime(date: Date, zone = CAMPAIGN_SCHEDULE_ZONE): string {
 const w = wallClock(date, zone);
 return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}
/** The input is explicitly in the displayed campaign zone, never the browser zone. */
export function campaignScheduleInstant(local: string, zone = CAMPAIGN_SCHEDULE_ZONE, now = new Date()): Date | null {
 const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
 if (!match) return null;
 const [, year, month, day, hour, minute] = match.map(Number);
 try {
  const instant = fromWallClock({ year, month, day, hour, minute, second: 0 }, zone);
  return Number.isFinite(instant.getTime()) && instant > now && campaignLocalTime(instant, zone) === local ? instant : null;
 } catch { return null; }
}
