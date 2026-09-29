import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PayPalError,
  capturePayPalOrder,
  chargePayPalVault,
  isPayPalRecurringEnabled,
  paypalAmountsMatch,
  paypalAuditView,
  paypalCaptureOf,
  paypalChargeFor,
  type PayPalOrder,
} from "@/lib/paypal";
import { normalizeDonationCurrencyCode } from "@/lib/exchange/convert-amount-in-currency-to-usd";
import { getDonorCountryCodeForSnapshot } from "@/lib/donations/donor-country-code";
import { dispatchDonationPaid, dispatchEvent } from "@/lib/events/dispatch";
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";
import { mintDonationAccessToken } from "@/lib/donations/access-token";
import { settlePayPalDonation } from "@/lib/donations/paypal-donation";
import { nextChargeAt, nextRetryAt, normalizeTimezone, type RecurringFrequency } from "./recurring-schedule";
import type { RecurringChargeOutcome, RecurringChargeSummary } from "./albaraka-recurring";

/**
 * The PayPal recurring scheduler  the Albaraka scheduler's twin for plans
 * paid with PayPal (`Subscription.provider = "PAYPAL"`).
 *
 * The plan's first instalment was a normal PayPal checkout that also vaulted
 * the donor's wallet (`paypalVaultId`). This job, run by
 * `/api/cron/recurring-charges`, charges every plan whose `nextBillingDate`
 * has passed against that vault as a merchant-initiated PayPal order, and
 * advances the date by the plan's own cadence in its own timezone.
 *
 * The same money rules as Albaraka:
 *  - never twice for one cycle: the key `pp-<plan>-<cycle>-<attempt>` is both
 *    the donation's `providerOrderId` (checked before charging) and the
 *    PayPal-Request-Id (PayPal returns the first order for a repeated key);
 *  - a row before the call, so a crash leaves a trace rather than an
 *    unrecorded charge;
 *  - missed cycles are not back-charged;
 *  - declines climb the retry ladder, then the plan is PAYMENT_FAILED.
 * And PayPal's own: the capture must be COMPLETED, for our custom_id, in the
 * amount and currency we asked for, before the row is PAID.
 */

type DueSubscription = Prisma.SubscriptionGetPayload<{ include: { items: true; categoryItems: true } }>;

function nextCycleAfter(frequency: RecurringFrequency, due: Date, now: Date, timezone: string): Date {
  let next = nextChargeAt(frequency, due, timezone);
  for (let i = 0; i < 2000 && next.getTime() <= now.getTime(); i += 1) {
    next = nextChargeAt(frequency, next, timezone);
  }
  return next;
}

export async function chargeDuePayPalSubscriptions(options: { now?: Date; dryRun?: boolean; limit?: number } = {}): Promise<RecurringChargeSummary> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));

  const summary: RecurringChargeSummary = {
    ranAt: now.toISOString(),
    dryRun,
    enabled: isPayPalRecurringEnabled(),
    scanned: 0,
    charged: [],
    failed: [],
    skipped: [],
  };
  if (!summary.enabled) return summary;

  const due = await prisma.subscription.findMany({
    where: {
      provider: "PAYPAL",
      status: "ACTIVE",
      paypalVaultId: { not: null },
      nextBillingDate: { lte: now },
    },
    include: { items: true, categoryItems: true },
    orderBy: { nextBillingDate: "asc" },
    take: limit,
  });
  summary.scanned = due.length;

  for (const sub of due) {
    let outcome: RecurringChargeOutcome;
    try {
      outcome = await chargeOne(sub, now, dryRun);
    } catch (err) {
      console.error("[paypal-recurring] charge threw", sub.id, err);
      outcome = { subscriptionId: sub.id, donationId: null, result: "unreachable", amountUSD: null, error: err instanceof Error ? err.message : String(err) };
    }
    if (outcome.result === "charged") summary.charged.push(outcome);
    else if (outcome.result === "already_attempted" || outcome.result === "dry_run") summary.skipped.push(outcome);
    else summary.failed.push(outcome);
  }
  return summary;
}

async function chargeOne(sub: DueSubscription, now: Date, dryRun: boolean): Promise<RecurringChargeOutcome> {
  const frequency = sub.frequency as RecurringFrequency;
  const timezone = normalizeTimezone(sub.timezone);
  const due = sub.nextBillingDate ?? now;
  const attempt = sub.chargeAttempts + 1;
  const key = `pp-${sub.id}-${due.getTime()}-${attempt}`;
  const base: RecurringChargeOutcome = { subscriptionId: sub.id, donationId: null, result: "declined", amountUSD: null };

  // ── Never twice for one cycle ────────────────────────────────────────────
  const existing = await prisma.donation.findFirst({ where: { subscriptionId: sub.id, providerOrderId: key }, select: { id: true } });
  if (existing) return { ...base, donationId: existing.id, result: "already_attempted" };

  // ── Amounts, as every rail builds a renewal row ─────────────────────────
  const fees = (sub.amount + sub.teamSupport) * 0.03;
  const totalAmount = sub.amount + sub.teamSupport + (sub.coverFees ? fees : 0);
  const amountUSD = sub.amountUSD ?? (normalizeDonationCurrencyCode(sub.currency) === "USD" ? sub.amount : null);
  const charge = await paypalChargeFor(totalAmount, sub.currency);
  if (!(Number(charge.value) > 0)) return { ...base, result: "declined", error: "Charge amount resolved to zero" };

  if (dryRun) return { ...base, result: "dry_run", amountUSD };

  const donorCountrySnapshot = (await getDonorCountryCodeForSnapshot(prisma, sub.donorId)) ?? undefined;

  // ── A row before the call ────────────────────────────────────────────────
  const donation = await prisma.donation.create({
    data: {
      accessToken: mintDonationAccessToken(),
      amount: sub.amount,
      amountUSD,
      teamSupport: sub.teamSupport,
      coverFees: sub.coverFees,
      currency: sub.currency,
      fees: sub.coverFees ? fees : 0,
      totalAmount,
      status: "PAID",
      donorCountryCode: donorCountrySnapshot,
      donorId: sub.donorId,
      subscriptionId: sub.id,
      referralId: sub.referralId ?? undefined,
      paymentMethod: "PAYPAL",
      provider: "PAYPAL",
      providerOrderId: key,
      providerTxnType: "RecurringCapture",
      providerTxnResult: "Pending",
      providerRaw: {
        paypalRecurring: { key, cycle: due.toISOString(), attempt, value: charge.value, currency: charge.currency, scheduledAt: now.toISOString() },
      } as Prisma.InputJsonValue,
      items: sub.items.length
        ? { create: sub.items.map((item) => ({ campaignId: item.campaignId, amount: item.amount, amountUSD: item.amountUSD, ...(item.shareCount ? { shareCount: item.shareCount } : {}) })) }
        : undefined,
      categoryItems: sub.categoryItems.length
        ? { create: sub.categoryItems.map((item) => ({ categoryId: item.categoryId, amount: item.amount, amountUSD: item.amountUSD })) }
        : undefined,
    },
    select: { id: true },
  });

  // ── The charge ───────────────────────────────────────────────────────────
  let order: PayPalOrder;
  try {
    order = await chargePayPalVault({ vaultId: sub.paypalVaultId as string, customId: donation.id, value: charge.value, currency: charge.currency, requestId: key });
    /* A vaulted-wallet order is normally captured as it is created; if PayPal
       leaves it approved instead, capture it with a key of its own. */
    if (order.status === "APPROVED" || order.status === "CREATED") {
      order = await capturePayPalOrder(order.id, `${key}-capture`);
    }
  } catch (err) {
    const unknownOutcome = !(err instanceof PayPalError) || err.status >= 500;
    return await recordFailure(sub, donation.id, attempt, now, err instanceof Error ? err.message : "PayPal charge failed", unknownOutcome ? "Unknown" : "Failed", amountUSD, err);
  }

  // ── Verify ───────────────────────────────────────────────────────────────
  const capture = paypalCaptureOf(order);
  const customId = order.purchase_units?.[0]?.custom_id ?? capture?.custom_id ?? "";
  const audit = { paypalCapture: paypalAuditView(order) };
  const problem =
    customId !== donation.id
      ? `PayPal custom_id mismatch (${customId || "none"})`
      : !capture || order.status !== "COMPLETED" || capture.status !== "COMPLETED"
        ? `PayPal capture not completed (order ${order.status}, capture ${capture?.status ?? "none"})`
        : capture.amount?.currency_code !== charge.currency
          ? `PayPal currency mismatch (expected ${charge.currency}, got ${capture.amount?.currency_code})`
          : !paypalAmountsMatch(capture.amount?.value, charge.value)
            ? `PayPal amount mismatch (expected ${charge.value}, got ${capture.amount?.value})`
            : null;
  if (problem || !capture?.amount) {
    return await recordFailure(sub, donation.id, attempt, now, problem ?? "PayPal returned no capture", "Failed", amountUSD, undefined, audit);
  }

  // ── Settle ───────────────────────────────────────────────────────────────
  await settlePayPalDonation({
    donationId: donation.id,
    orderId: order.id,
    captureId: capture.id,
    paidAmount: Number(capture.amount.value),
    paidCurrency: capture.amount.currency_code,
    audit,
    vault: null,
    paidAt: now,
  });
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "ACTIVE", lastBillingDate: now, nextBillingDate: nextCycleAfter(frequency, due, now, timezone), chargeAttempts: 0, lastChargeError: null },
  });

  void dispatchDonationPaid(donation.id);
  void dispatchEvent("SUBSCRIPTION_PAYMENT", { donationId: donation.id });
  return { ...base, donationId: donation.id, result: "charged", amountUSD };
}

async function recordFailure(
  sub: DueSubscription,
  donationId: string,
  attempt: number,
  now: Date,
  reason: string,
  txnResult: "Failed" | "Unknown",
  amountUSD: number | null,
  err?: unknown,
  audit?: Record<string, unknown>
): Promise<RecurringChargeOutcome> {
  if (err) console.error("[paypal-recurring]", reason, sub.id, err instanceof PayPalError ? err.body : err);
  const retryAt = nextRetryAt(attempt, now);
  const current = audit ? await prisma.donation.findUnique({ where: { id: donationId }, select: { providerRaw: true } }) : null;
  const currentRaw =
    current?.providerRaw && typeof current.providerRaw === "object" && !Array.isArray(current.providerRaw)
      ? (current.providerRaw as Record<string, unknown>)
      : {};

  await prisma.$transaction([
    prisma.donation.update({
      where: { id: donationId },
      data: {
        status: "FAILED",
        providerTxnResult: txnResult,
        providerErrorMessage: reason.slice(0, 500),
        ...(audit ? { providerRaw: { ...currentRaw, ...audit } as Prisma.InputJsonValue } : {}),
      },
    }),
    prisma.subscription.update({
      where: { id: sub.id },
      data: retryAt
        ? { chargeAttempts: attempt, nextBillingDate: retryAt, lastChargeError: reason.slice(0, 300) }
        : { status: "PAYMENT_FAILED", chargeAttempts: attempt, lastChargeError: reason.slice(0, 300) },
    }),
  ]);

  void dispatchEvent("DONATION_FAILED", { donationId });
  void sendDonationFailedConversions(donationId);
  if (!retryAt) void dispatchEvent("SUBSCRIPTION_CANCELLED", { userId: sub.donorId });

  return { subscriptionId: sub.id, donationId, result: txnResult === "Unknown" ? "unreachable" : "declined", amountUSD, error: reason };
}
