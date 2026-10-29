import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { isAlbarakaRecurringCheckoutReady, isAlbarakaRecurringEnabled } from "@/lib/albaraka";
import { isPayPalConfigured, isPayPalRecurringEnabled } from "@/lib/paypal";
import { loadSubscriptionFrequencies } from "@/lib/dashboard/recurring-frequency-filter";
import { type BillingReadiness } from "@/lib/donations/recurring-readiness";
import { recurringScheduleSnapshot } from "@/lib/donations/recurring-schedule-snapshot";
export const dynamic = "force-dynamic";
/** Runtime configuration + ledger reads only. Never invokes a cron or payment provider. */
export async function GET() {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "monthly"); if (denied) return denied;
  try {
    const now = new Date(), groups: Record<string, { provider: string; frequency: string; total: number; readiness: Partial<Record<BillingReadiness, number>>; failed: number }> = {};
    const schedule = recurringScheduleSnapshot(now);
    let cursor: string | undefined, scanned = 0, complete = false;
    while (scanned < 100000) {
      const rows = await prisma.subscription.findMany({ where: cursor ? { id: { gt: cursor } } : {}, orderBy: { id: "asc" }, take: 1000,
        select: { id: true, provider: true, status: true, nextBillingDate: true, lastBillingDate: true, paymentCardId: true, paypalVaultId: true, stripeSubscriptionId: true, payforToken: true, amountChangeLock: true, billingLeaseUntil: true, donations: { where: { paidAt: { not: null } }, select: { id: true }, take: 1 } } });
      const frequencyOf = await loadSubscriptionFrequencies(prisma, rows.map(row => row.id));
      for (const row of rows) {
        const provider = row.provider || "STRIPE", frequency = frequencyOf(row.id), key = `${provider}:${frequency}`;
        const group = groups[key] ||= { provider, frequency, total: 0, readiness: {}, failed: 0 };
        const readiness = schedule.add({ ...row, hasPaidDonation: row.donations.length > 0 });
        group.total++; group.readiness[readiness] = (group.readiness[readiness] || 0) + 1; if (row.status === "PAYMENT_FAILED") group.failed++;
      }
      scanned += rows.length; if (rows.length < 1000) { complete = true; break; } cursor = rows.at(-1)!.id;
    }
    const lastCheck = await prisma.auditLog.findFirst({ where: { action: { in: ["RECURRING_CHARGES_CHECK", "RECURRING_CHARGES_RUN", "RECURRING_CHARGES_FAILED"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, action: true, messageAr: true, metadata: true } });
    const metadata = lastCheck?.metadata && typeof lastCheck.metadata === "object" && !Array.isArray(lastCheck.metadata) ? lastCheck.metadata : {};
    const age = lastCheck ? now.getTime() - lastCheck.createdAt.getTime() : null;
    const schedulerState = !lastCheck ? "never" : lastCheck.action === "RECURRING_CHARGES_FAILED" || metadata.ok === false ? "failed" : age! < -300000 ? "unconfirmed" : age! > 40 * 60000 ? "stale" : "recent";
    return NextResponse.json({ schedule: schedule.result(), schedulerState, checkedAt: now.toISOString(), readOnly: true, complete, groups: Object.values(groups), providers: { ALBARAKA: { enabled: isAlbarakaRecurringEnabled(), signupReady: isAlbarakaRecurringCheckoutReady() }, PAYPAL: { enabled: isPayPalConfigured() && isPayPalRecurringEnabled(), signupReady: isPayPalConfigured() && isPayPalRecurringEnabled() } }, lastCheck: lastCheck ? { createdAt: lastCheck.createdAt, action: lastCheck.action, messageAr: lastCheck.messageAr } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "RECURRING_HEALTH_UNAVAILABLE" }, { status: 503 }); }
}
