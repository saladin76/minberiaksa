import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { chargeDueAlbarakaSubscriptions } from "@/lib/donations/albaraka-recurring";
import { chargeDuePayPalSubscriptions } from "@/lib/donations/paypal-recurring";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The recurring scheduler's tick (`vercel.json`, every 15 minutes).
 *
 * Charges every Albaraka plan (stored card) and every PayPal plan (vaulted
 * wallet) whose `nextBillingDate` has passed, and advances it by the plan's
 * cadence  see `lib/donations/albaraka-recurring.ts` and
 * `lib/donations/paypal-recurring.ts` for the money rules. Stripe plans are
 * not touched: Stripe bills those itself.
 *
 * Authenticated like every other cron here (`Authorization: Bearer $CRON_SECRET`),
 * and  unlike the retired `/api/cron/monthly-billing`  it fails CLOSED when
 * the secret is unset. `?dryRun=1` reports what would be charged without
 * writing anything or calling the bank.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const summary = await chargeDueAlbarakaSubscriptions({ dryRun });
    /* PayPal runs after Albaraka and on its own: one rail failing must not
       stop the other from billing. */
    const paypal = await chargeDuePayPalSubscriptions({ dryRun }).catch((error) => {
      console.error("paypal recurring run failed", error);
      return null;
    });

    for (const [rail, run] of [["البركة", summary], ["PayPal", paypal]] as const) {
      if (!run || dryRun || (run.charged.length === 0 && run.failed.length === 0)) continue;
      const usd = run.charged.reduce((sum, c) => sum + (c.amountUSD ?? 0), 0);
      const railEn = rail === "PayPal" ? "PayPal" : "Albaraka";
      await writeAuditLog({
        actorRole: "SYSTEM",
        action: "RECURRING_CHARGES_RUN",
        messageAr: `المجدوِل حصّل ${run.charged.length} دفعة دورية عبر ${rail} (≈ ${usd.toFixed(2)} دولار) وفشلت ${run.failed.length}`,
        messageEn: `Scheduler charged ${run.charged.length} ${railEn} recurring instalment(s) (≈ ${usd.toFixed(2)}); ${run.failed.length} failed`,
        entityType: "Subscription",
        metadata: {
          externalCall: true,
          rail: railEn.toUpperCase(),
          charged: run.charged.map((c) => c.donationId),
          failed: run.failed.map((f) => ({ subscriptionId: f.subscriptionId, result: f.result, error: f.error })),
        },
        stream: "TEAM",
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...summary, paypal });
  } catch (error) {
    console.error("recurring-charges cron failed", error);
    await writeAuditLog({
      actorRole: "SYSTEM",
      action: "RECURRING_CHARGES_FAILED",
      messageAr: "فشل تشغيل مجدوِل الدفعات الدورية",
      messageEn: "Recurring-charges scheduler run failed",
      entityType: "Subscription",
      metadata: { externalCall: true },
      stream: "TEAM",
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "Scheduler run failed" }, { status: 500 });
  }
}
