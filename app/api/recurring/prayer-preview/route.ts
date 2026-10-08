import { NextRequest, NextResponse } from "next/server";
import { firstPrayerChargeAfterCheckout } from "@/lib/donations/prayer-time-schedule";
import { normalizeTimezone, parseScheduleChoice, scheduleRuleFor } from "@/lib/donations/recurring-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anonymous, read-only preview. The actual checkout recalculates independently. */
export async function POST(request: NextRequest) {
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { timezone, schedule } = payload as { timezone?: unknown; schedule?: unknown };
  if (typeof timezone !== "string" || normalizeTimezone(timezone, "") !== timezone) {
    return NextResponse.json({ error: "Valid IANA timezone required" }, { status: 400 });
  }
  const parsed = parseScheduleChoice(schedule);
  if (!parsed.ok || !parsed.value || parsed.value.mode !== "prayer") {
    return NextResponse.json({ error: "Valid Friday prayer location required" }, { status: 400 });
  }
  try {
    const now = new Date();
    const rule = scheduleRuleFor("FRIDAY", now, timezone, parsed.value);
    if (rule.kind !== "prayer") throw new Error("Invalid prayer rule");
    const next = await firstPrayerChargeAfterCheckout(rule, now, timezone);
    return NextResponse.json({ nextChargeAt: next.toISOString(), timezone, calculation: "Diyanet / AlAdhan method 13", prayer: "Dhuhr", minutesBefore: 30 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Prayer time could not be resolved, please use fixed timing or try later" }, { status: 503 });
  }
}
