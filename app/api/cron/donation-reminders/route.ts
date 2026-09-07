import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { runDonationLapsedReminders } from "@/lib/events/donation-lapsed";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily evaluation of the DONATION_LAPSED trigger ("donate again" reminder).
 *
 * Does nothing at all unless an enabled DONATION_LAPSED MessageTrigger exists — the dashboard
 * checkbox is the on/off switch. Requires the same CRON_SECRET bearer token as the other protected
 * cron routes; Vercel Cron sends it automatically once CRON_SECRET is set on the project.
 *
 * `?dryRun=1` reports who would be reminded without contacting any provider — for verifying the
 * configuration before switching the trigger on.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const summary = await runDonationLapsedReminders({ actorRole: "SYSTEM", dryRun });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("donation-reminders cron failed", error);
    await writeAuditLog({
      actorRole: "SYSTEM",
      action: "DONATION_LAPSED_REMINDERS_FAILED",
      messageAr: "فشل تشغيل تذكير التبرّع مجددًا",
      messageEn: "Donation reminder cron run failed",
      entityType: "MessageTrigger",
      metadata: { externalCall: false },
      stream: "TEAM",
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "run failed" }, { status: 500 });
  }
}
