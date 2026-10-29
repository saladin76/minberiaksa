/** Read-only: no payment provider requests, cron execution, or database writes. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { loadSubscriptionFrequencies } from "../lib/dashboard/recurring-frequency-filter";
import { recurringScheduleSnapshot } from "../lib/donations/recurring-schedule-snapshot";
import { albaraka2DConfig, albarakaRecurringConfig, isAlbarakaConfigured, isAlbarakaRecurringCheckoutReady } from "../lib/albaraka";

loadEnvConfig(process.cwd(), false);

const prisma = new PrismaClient();
const now = new Date();
const schedule = recurringScheduleSnapshot(now);
type Counts = { total: number; active: number; awaitingFirstPayment: number; paidWithoutBillingDate: number; missingPaymentMethod: number; missingNextDate: number; due: number; eligibleForScheduler: number; paymentFailed: number };
const groups: Record<string, Counts> = {};

async function main() {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.subscription.findMany({
      orderBy: { id: "asc" }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, provider: true, amountChangeLock: true, billingLeaseUntil: true, status: true, stripeSubscriptionId: true, payforToken: true,
        paymentCardId: true, paypalVaultId: true, lastBillingDate: true, nextBillingDate: true,
        _count: { select: { donations: { where: { paidAt: { not: null } } } } },
      },
    });
    const frequencyOf = await loadSubscriptionFrequencies(prisma, rows.map(row => row.id));
    for (const row of rows) {
      schedule.add({ ...row, hasPaidDonation: row._count.donations > 0 });
      const stripeId = row.stripeSubscriptionId ?? row.payforToken;
      const rail = row.provider ?? (stripeId?.startsWith("sub_") ? "STRIPE" : "UNLINKED");
      const key = `${rail}/${frequencyOf(row.id)}`;
      const count = groups[key] ??= { total: 0, active: 0, awaitingFirstPayment: 0, paidWithoutBillingDate: 0, missingPaymentMethod: 0, missingNextDate: 0, due: 0, eligibleForScheduler: 0, paymentFailed: 0 };
      count.total++;
      if (row.status === "PAYMENT_FAILED") count.paymentFailed++;
      if (row.status !== "ACTIVE") continue;
      count.active++;
      const settled = row._count.donations > 0;
      if (!settled) count.awaitingFirstPayment++;
      if (settled && !row.lastBillingDate) count.paidWithoutBillingDate++;
      const linked = rail === "ALBARAKA" ? Boolean(row.paymentCardId) : rail === "PAYPAL" ? Boolean(row.paypalVaultId) : rail === "STRIPE" ? Boolean(stripeId?.startsWith("sub_")) : false;
      if (!linked) count.missingPaymentMethod++;
      if (!row.nextBillingDate) count.missingNextDate++;
      const due = Boolean(row.nextBillingDate && row.nextBillingDate <= now);
      if (due) count.due++;
      if (due && linked && settled && row.lastBillingDate && (rail === "ALBARAKA" || rail === "PAYPAL")) count.eligibleForScheduler++;
    }
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].id;
  }
  console.log(JSON.stringify({
    ranAt: now.toISOString(), readOnly: true, providerCalls: 0, databaseWrites: 0,
    readiness: {
      albarakaSignupTerminalConfigured: isAlbarakaConfigured(albaraka2DConfig()),
      albarakaRecurringTerminalConfigured: isAlbarakaConfigured(albarakaRecurringConfig()),
      albarakaRecurringSwitchEnabled: process.env.ALBARAKA_RECURRING_ENABLED === "1",
      albarakaRecurringCheckoutReady: isAlbarakaRecurringCheckoutReady(),
      paypalCredentialsPresent: Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim()),
      paypalRecurringSwitchEnabled: (process.env.PAYPAL_RECURRING_ENABLED ?? "1").trim() !== "0",
      stripeCredentialsPresent: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
      cronSecretPresent: Boolean(process.env.CRON_SECRET?.trim()),
      cronBaseOverridePresent: Boolean(process.env.CRON_BASE_URL?.trim()),
    },
    groups,
    schedule: schedule.result(),
    notes: [
      "Counts alone do not prove bank/vault approval or that cron reaches the running app.",
      "Stripe bills its subscriptions externally; a past local date is not proof of an unpaid Stripe invoice.",
      "paidWithoutBillingDate and missingPaymentMethod require reconciliation; this script never activates or charges plans.",
      "No card data, donor contacts, provider keys, or subscription identifiers are printed.",
    ],
  }, null, 2));
}

main().catch(() => {
  console.error("Recurring read-only audit failed. Check the database connection and generated Prisma client on this server.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
