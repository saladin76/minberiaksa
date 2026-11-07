import test from "node:test";
import assert from "node:assert/strict";
import { calendarMonthLayout, calendarDateLabel, calendarWeekLabels } from "../../lib/dashboard/calendar-layout";
import { calendarOccurrences, recurringCalendarMonth, calendarDay } from "../../lib/dashboard/recurring-calendar";
import { wallClock } from "../../lib/donations/recurring-schedule";

test("November 2026 starts Sunday and its Fridays occupy the Friday column",()=>{
 const layout=calendarMonthLayout("2026-11")!;assert.equal(layout.leading,0);assert.equal(layout.days.length,30);assert.deepEqual(layout.days.filter(day=>day.weekday===5).map(day=>day.day),[6,13,20,27]);
 const october=calendarMonthLayout("2026-10")!;assert.equal(october.leading,4);assert.equal(october.days.at(-1)!.day,31);assert.equal(calendarMonthLayout("2026-02")!.days.length,28);assert.equal(calendarMonthLayout("2028-02")!.days.length,29);
 for(const locale of ["ar","en","tr"]){assert.equal(new Set(calendarWeekLabels(locale)).size,7);assert.ok(calendarDateLabel("2026-11",6,locale).includes(calendarWeekLabels(locale)[5].replace(/\.$/,""))||locale==="en");}
 assert.equal(calendarMonthLayout("2026-13"),null);assert.equal(calendarDateLabel("2026-02",31,"ar"),"");
});
test("Friday calendar projections use the same weekday engine and skip a stale non-Friday retry date",()=>{
 const month=recurringCalendarMonth("2026-11")!,plan={frequency:"FRIDAY",timezone:"Europe/Istanbul",scheduleRule:{kind:"weekday",weekday:5,hour:9,minute:30},nextBillingDate:new Date("2026-11-02T06:30:00Z")};
 const dates=calendarOccurrences(plan,month)!;assert.deepEqual(dates.map(date=>calendarDay(date,month)),[6,13,20,27]);assert.ok(dates.every(date=>wallClock(date,plan.timezone).weekday===5));
});
test("a Friday in another timezone is bucketed honestly in Istanbul, with its own weekday rule preserved",()=>{
 const month=recurringCalendarMonth("2026-11")!,plan={frequency:"FRIDAY",timezone:"America/Los_Angeles",scheduleRule:{kind:"weekday",weekday:5,hour:23,minute:30},nextBillingDate:new Date("2026-11-07T07:30:00Z")};
 const dates=calendarOccurrences(plan,month)!;assert.deepEqual(dates.map(date=>calendarDay(date,month)),[7,14,21,28]);assert.ok(dates.every(date=>wallClock(date,plan.timezone).weekday===5));
});
