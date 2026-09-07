import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { syncElasticEmailEvents } from "@/lib/communication/email-event-sync";
import { writeAuditLog } from "@/lib/audit-log";

/**
 * Pulls Elastic Email's event feed and reconciles the delivery log against it, so a delivery row
 * that says SENT (= "the provider returned 2xx") is corrected to FAILED/BOUNCED/DELIVERED once the
 * provider decides what actually happened. Without this the campaign screen reports أُرسل for
 * suppressed and refused mail, because the webhook that would say otherwise is not registered.
 *
 * Read-only against the provider: it fetches events and writes only to our own tables.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // `?lookbackMinutes=` widens the window for a one-off backfill. The scheduled run passes nothing
  // and keeps the 3-hour default; a delivery whose outcome landed outside that window (cron not yet
  // deployed, or down longer than the window) is never revisited by anything else.
  const requested = Number(request.nextUrl.searchParams.get("lookbackMinutes"));
  const lookbackMinutes = Number.isFinite(requested) && requested > 0 ? requested : undefined;

  const result = await syncElasticEmailEvents({ lookbackMinutes });
  if (!result.ok) {
    // A provider outage or an unconfigured key is not a server fault — answer 200 so the scheduler
    // does not treat a known, reported condition as an incident to retry against.
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
  }

  if (result.deliveryUpdates > 0 || result.campaignUpdates > 0) {
    await writeAuditLog({
      actorRole: "SYSTEM",
      action: "communication.email.events.synced",
      messageAr: `مزامنة أحداث البريد — تحديث ${result.deliveryUpdates} سجل تسليم و${result.campaignUpdates} حملة`,
      messageEn: `Email event sync — ${result.deliveryUpdates} delivery record(s) and ${result.campaignUpdates} campaign(s) corrected`,
      entityType: "CommunicationDelivery",
      metadata: { ...result, externalCall: false },
      stream: "TEAM",
    }).catch(() => {});
  }

  // `result` already carries `ok: true` — respreading it produced a duplicate key.
  return NextResponse.json(result);
}
