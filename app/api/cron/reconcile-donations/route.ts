import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { reconcileUnconfirmedDonations } from "@/lib/donations/reconcile-unconfirmed";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Half-hour confirmation polling for online donations. Provider uncertainty
 * stays distinguishable from an authoritative unpaid result after 24 hours.
 *
 * The existing provider settlement owns paidAt, revenue and subscription
 * activation. This job asks the recorded provider and reuses that settlement;
 * age by itself is never proof that an unknown bank response means unpaid.
 *
 * `?dryRun=1` reports the same summary without writing anything.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const summary = await reconcileUnconfirmedDonations({ dryRun });

    // Recovered money is the whole point of the job  make it loud rather than leaving it in a
    // response body nobody reads.
    if (summary.credited.length > 0 && !dryRun) {
      await writeAuditLog({
        actorRole: "SYSTEM",
        action: "DONATIONS_RECONCILED_FROM_PROVIDERS",
        messageAr: `تم اعتماد ${summary.credited.length} تبرع مؤكد لدى بوابة الدفع لم يصل إشعارها (${summary.creditedTotalUSD.toFixed(2)} دولار)`,
        messageEn: `Credited ${summary.credited.length} donation(s) confirmed paid by their provider whose confirmation never arrived ($${summary.creditedTotalUSD.toFixed(2)})`,
        entityType: "Donation",
        metadata: { externalCall: true, donationIds: summary.credited.map((c) => c.donationId) },
        stream: "TEAM",
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("reconcile-donations cron failed", error);
    await writeAuditLog({
      actorRole: "SYSTEM",
      action: "DONATIONS_RECONCILE_FAILED",
        messageAr: "فشل تشغيل مطابقة التبرعات مع مزودي الدفع",
      messageEn: "Donation reconciliation cron run failed",
      entityType: "Donation",
      metadata: { externalCall: true },
      stream: "TEAM",
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "Reconciliation failed" }, { status: 500 });
  }
}
