import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { reconcileUnconfirmedDonations } from "@/lib/donations/reconcile-unconfirmed";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily safety net for donations whose Stripe webhook never landed.
 *
 * A one-time donation row is created as `status=PAID, paidAt=null` before the donor reaches
 * Stripe; only the webhook sets `paidAt` and increments campaign `currentAmount`. If that webhook
 * is missed — a bad endpoint registration, an outage — the payment succeeds at Stripe and the
 * platform never records it. That failure is completely silent: no error anywhere, the money just
 * never appears. It went unnoticed long enough to strand five real payments.
 *
 * This asks Stripe what actually happened to every unconfirmed row, credits the ones that really
 * paid, and ages out the abandoned carts so they stop masquerading as pending.
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

    // Recovered money is the whole point of the job — make it loud rather than leaving it in a
    // response body nobody reads.
    if (summary.credited.length > 0 && !dryRun) {
      await writeAuditLog({
        actorRole: "SYSTEM",
        action: "DONATIONS_RECONCILED_FROM_STRIPE",
        messageAr: `تم اعتماد ${summary.credited.length} تبرع مؤكد من Stripe لم يصل إشعارها (${summary.creditedTotalUSD.toFixed(2)} دولار)`,
        messageEn: `Credited ${summary.credited.length} donation(s) confirmed paid at Stripe whose webhook never arrived ($${summary.creditedTotalUSD.toFixed(2)})`,
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
      messageAr: "فشل تشغيل مطابقة التبرعات مع Stripe",
      messageEn: "Donation reconciliation cron run failed",
      entityType: "Donation",
      metadata: { externalCall: true },
      stream: "TEAM",
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "Reconciliation failed" }, { status: 500 });
  }
}
