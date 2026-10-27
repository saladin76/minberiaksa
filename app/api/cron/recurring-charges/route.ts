import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { chargeDueAlbarakaSubscriptions } from "@/lib/donations/albaraka-recurring";
import { chargeDuePayPalSubscriptions } from "@/lib/donations/paypal-recurring";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
// Charges through Albaraka, which only accepts the project's Static IPs (sin1).
export const preferredRegion = "sin1";

/**
 * The recurring scheduler's tick, every 15 minutes: `vercel.json` on Vercel,
 * the crontab written by `scripts/vps-cron-install.sh` on the VPS.
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
    let albarakaFailed = false;
    let paypalFailed = false;
    const summary = await chargeDueAlbarakaSubscriptions({ dryRun }).catch((error) => {
      albarakaFailed = true;
      console.error("albaraka recurring run failed", error);
      return null;
    });
    /* PayPal runs after Albaraka and on its own: one rail failing must not
       stop the other from billing. */
    const paypal = await chargeDuePayPalSubscriptions({ dryRun }).catch((error) => {
      paypalFailed = true;
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

    const ok = !albarakaFailed && !paypalFailed;
    if (!dryRun) await writeAuditLog({ actorRole: "SYSTEM", action: "RECURRING_CHARGES_CHECK", entityType: "Subscription", stream: "TEAM", messageAr: `فحص التجديد: البركة ${summary?.scanned ?? 0} مستحق، PayPal ${paypal?.scanned ?? 0} مستحق؛ نجح ${Number(summary?.charged.length ?? 0) + Number(paypal?.charged.length ?? 0)} وفشل ${Number(summary?.failed.length ?? 0) + Number(paypal?.failed.length ?? 0)}.`, metadata: { ok, albarakaEnabled: summary?.enabled ?? false, paypalEnabled: paypal?.enabled ?? false, charged: Number(summary?.charged.length ?? 0) + Number(paypal?.charged.length ?? 0), failed: Number(summary?.failed.length ?? 0) + Number(paypal?.failed.length ?? 0) } }).catch(() => {});
    return NextResponse.json({ ok, ...(summary ?? {}), paypal,
      ...(ok ? {} : { error: "One or more recurring providers failed", providerErrors: { albaraka: albarakaFailed, paypal: paypalFailed } }),
    }, { status: ok ? 200 : 500 });
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
