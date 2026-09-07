import { NextRequest, NextResponse } from "next/server";
import { runDueCampaigns } from "@/lib/communication/campaign-send-executor";
import { writeAuditLog } from "@/lib/audit-log";
import { SCHEDULER_RUN_ACTION, SCHEDULER_RUN_FAILED_ACTION } from "@/lib/communication/scheduler-status";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runDueCampaigns({ actor: { actorRole: "SYSTEM" }, max: 20 });
    const totals = results.reduce(
      (acc, row) => ({ sent: acc.sent + row.sent, skipped: acc.skipped + row.skipped, failed: acc.failed + row.failed }),
      { sent: 0, skipped: 0, failed: 0 }
    );
    await writeAuditLog({
      actorRole: "SYSTEM",
      action: SCHEDULER_RUN_ACTION,
      // Kept on every run — `getSchedulerStatus()` reads these rows to show
      // «آخر تشغيل», so silence would read as a dead cron. They are classified
      // as diagnostics instead, and stay out of the activity view.
      messageAr: results.length
        ? `تشغيل جدولة التواصل — ${results.length} حملة مستحقة (أُرسل ${totals.sent}، تخطّي ${totals.skipped}، فشل ${totals.failed})`
        : "تشغيل جدولة التواصل — لا حملات مستحقة",
      messageEn: `Communication scheduler run — ${results.length} due campaign(s)`,
      entityType: "CommunicationScheduler",
      metadata: { ran: results.length, ...totals, externalCall: totals.sent > 0 },
      stream: "TEAM",
    });
    return NextResponse.json({ ok: true, ran: results.length, ...totals });
  } catch {
    await writeAuditLog({
      actorRole: "SYSTEM",
      action: SCHEDULER_RUN_FAILED_ACTION,
      messageAr: "فشل تشغيل جدولة التواصل",
      messageEn: "Communication scheduler run failed",
      entityType: "CommunicationScheduler",
      metadata: { externalCall: false },
      stream: "TEAM",
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "run failed" }, { status: 500 });
  }
}
