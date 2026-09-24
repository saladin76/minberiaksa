import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { chargeDueAlbarakaSubscriptions } from "@/lib/donations/albaraka-recurring";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The Albaraka recurring scheduler's tick (`vercel.json`, every 15 minutes).
 *
 * Charges every Albaraka plan whose `nextBillingDate` has passed and advances
 * it by the plan's cadence — see `lib/donations/albaraka-recurring.ts` for
 * the money rules. Stripe plans are not touched: Stripe bills those itself.
 *
 * Authenticated like every other cron here (`Authorization: Bearer $CRON_SECRET`),
 * and — unlike the retired `/api/cron/monthly-billing` — it fails CLOSED when
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

    if (!dryRun && (summary.charged.length > 0 || summary.failed.length > 0)) {
      const usd = summary.charged.reduce((sum, c) => sum + (c.amountUSD ?? 0), 0);
      await writeAuditLog({
        actorRole: "SYSTEM",
        action: "RECURRING_CHARGES_RUN",
        messageAr: `المجدوِل حصّل ${summary.charged.length} دفعة دورية عبر البركة (≈ ${usd.toFixed(2)} دولار) وفشلت ${summary.failed.length}`,
        messageEn: `Scheduler charged ${summary.charged.length} Albaraka recurring instalment(s) (≈ $${usd.toFixed(2)}); ${summary.failed.length} failed`,
        entityType: "Subscription",
        metadata: {
          externalCall: true,
          charged: summary.charged.map((c) => c.donationId),
          failed: summary.failed.map((f) => ({ subscriptionId: f.subscriptionId, result: f.result, error: f.error })),
        },
        stream: "TEAM",
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...summary });
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
