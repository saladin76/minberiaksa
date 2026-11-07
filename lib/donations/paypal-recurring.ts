import { inheritRecurringAttribution } from "./recurring-attribution";
import "server-only";
import { withRecurringLease } from "./recurring-lease";
import { runAfterResponse } from "@/lib/events/after-response";

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
import { nextChargeAfterPayment, nextRetryForPlan } from "./recurring-schedule";
import { inspectRecurringBillingSafety, applyRecurringBillingSafety, deferClosedFridayWindow, fridayBillingWindowClosed } from "./recurring-billing-safety";
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
      lastBillingDate: { not: null },
      donations: { some: { status: "PAID", paidAt: { not: null } } },
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
      outcome = dryRun ? await chargeOne(sub, now, true) : await withRecurringLease(prisma, sub, now, () => chargeOne(sub, now, false)) ?? { subscriptionId: sub.id, donationId: null, result: "already_attempted", amountUSD: null, error: "Billing cycle is being processed or changed" };
    } catch (err) {
      console.error("[paypal-recurring] charge threw", sub.id, err);
      outcome = { subscriptionId: sub.id, donationId: null, result: "unreachable", amountUSD: null, error: err instanceof Error ? err.message : String(err) };
    }
    if (outcome.result === "charged") summary.charged.push(outcome);
    else if (outcome.result === "already_attempted" || outcome.result === "dry_run" || outcome.result === "schedule_postponed") summary.skipped.push(outcome);
    else summary.failed.push(outcome);
  }
  return summary;
}

async function chargeOne(sub: DueSubscription, now: Date, dryRun: boolean): Promise<RecurringChargeOutcome> {
  now = new Date(Math.max(now.getTime(), Date.now()));
  const due = sub.nextBillingDate ?? now;
  const attempt = sub.chargeAttempts + 1;
  const key = `pp-${sub.id}-${due.getTime()}-${attempt}`;
  const base: RecurringChargeOutcome = { subscriptionId: sub.id, donationId: null, result: "declined", amountUSD: null };

  {
    const safety = await inspectRecurringBillingSafety(prisma, sub, now);
    if (safety.state !== "ready") {
      if (!dryRun && !await applyRecurringBillingSafety(prisma, sub, safety)) return { ...base, result: "already_attempted" };
      return { ...base, result: safety.state === "postpone" ? "schedule_postponed" : "review_required", error: safety.reason };
    }
  }

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
  const attribution = await inheritRecurringAttribution(prisma, sub.id, sub.donorId);
  const donation = await prisma.donation.create({
    data: {
      ...(attribution ? { attribution } : {}),
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
      billingReason: "subscription_cycle",
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
  if (await deferClosedFridayWindow(prisma, sub, donation.id, new Date(Math.max(now.getTime(), Date.now())))) return {...base,donationId:donation.id,result:"schedule_postponed",error:"FRIDAY_ONLY"};

  let order: PayPalOrder;
  try {
    order = await chargePayPalVault({ vaultId: sub.paypalVaultId as string, customId: donation.id, value: charge.value, currency: charge.currency, requestId: key });
    /* A vaulted-wallet order is normally captured as it is created; if PayPal
       leaves it approved instead, capture it with a key of its own. */
    if (order.status === "APPROVED" || order.status === "CREATED") {
      order = await capturePayPalOrder(order.id, `${key}-capture`);
    }
  } catch (err) {
    now = new Date(Math.max(now.getTime(), Date.now()));
    const unknownOutcome = !(err instanceof PayPalError) || err.status >= 500;
    if (!unknownOutcome) {
      return await recordFailure(sub, donation.id, attempt, now, err instanceof Error ? err.message : "PayPal charge failed", "Failed", amountUSD, err);
    }
    /* A timeout or 5xx: PayPal may have charged. Replaying the same request id
       returns the order it already made instead of charging again, so ask once
       that way; if that also fails, the plan is paused rather than retried with
       a fresh key that PayPal would treat as a new charge. */
    if (fridayBillingWindowClosed(sub, now)) return await holdUnresolved(sub, donation.id, "PayPal outcome unknown after Friday window closed; verify the original order before resuming", amountUSD, err);
    console.error("[paypal-recurring] unknown outcome, replaying request id", sub.id, err instanceof PayPalError ? err.body : err);
    try {
      order = await chargePayPalVault({ vaultId: sub.paypalVaultId as string, customId: donation.id, value: charge.value, currency: charge.currency, requestId: key });
      if (order.status === "APPROVED" || order.status === "CREATED") {
        order = await capturePayPalOrder(order.id, `${key}-capture`);
      }
    } catch (replayErr) {
      return await holdUnresolved(sub, donation.id, `PayPal outcome unknown for ${key}; check the PayPal dashboard before resuming`, amountUSD, replayErr);
    }
  }

  // ── Verify ───────────────────────────────────────────────────────────────
  const capture = paypalCaptureOf(order);
  const customId = order.purchase_units?.[0]?.custom_id ?? capture?.custom_id ?? "";
  now = new Date(Math.max(now.getTime(), Date.now()));
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
  /* Money that was (or may yet be) taken must not be charged again: a capture
     PayPal holds for review (PENDING), or a COMPLETED capture that fails our
     checks. Both pause the plan for staff instead of climbing the retry ladder. */
  if (problem && capture && (capture.status === "PENDING" || capture.status === "COMPLETED")) {
    return await holdUnresolved(sub, donation.id, `${problem}; capture ${capture.id} — check PayPal before resuming`, amountUSD, undefined, audit);
  }
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
    data: { lastBillingDate: now, nextBillingDate: nextChargeAfterPayment(sub, now), chargeAttempts: 0, lastChargeError: null },
  });

  runAfterResponse(() => dispatchDonationPaid(donation.id));
  runAfterResponse(() => dispatchEvent("SUBSCRIPTION_PAYMENT", { donationId: donation.id }));
  return { ...base, donationId: donation.id, result: "charged", amountUSD };
}

/**
 * PayPal may have taken the money but the charge cannot be confirmed. Charging
 * again could bill the donor twice, so the plan is paused (the scheduler only
 * charges ACTIVE plans) until staff check PayPal and resume it. The row stays
 * unpaid with the reason; the donor is not told the plan was cancelled.
 */
async function holdUnresolved(
  sub: DueSubscription,
  donationId: string,
  reason: string,
  amountUSD: number | null,
  err?: unknown,
  audit?: Record<string, unknown>
): Promise<RecurringChargeOutcome> {
  console.error("[paypal-recurring] unresolved charge, plan paused", sub.id, reason, err instanceof PayPalError ? err.body : err ?? "");
  const held = await prisma.$transaction(async (tx) => {
    const fresh = await tx.donation.findUnique({ where: { id: donationId }, select: { paidAt: true, providerRaw: true } });
    if (!fresh) throw new Error("Recurring donation no longer exists");
    if (fresh.paidAt) return false;
    const raw = fresh.providerRaw && typeof fresh.providerRaw === "object" && !Array.isArray(fresh.providerRaw) ? fresh.providerRaw as Record<string, unknown> : {};
    await tx.donation.update({where:{id:donationId},data:{status:"FAILED",providerTxnResult:"Unknown",providerErrorMessage:reason.slice(0,500),...(audit?{providerRaw:{...raw,...audit} as Prisma.InputJsonValue}:{})}});
    await tx.subscription.updateMany({where:{id:sub.id,status:"ACTIVE"},data:{status:"PAUSED",lastChargeError:reason.slice(0,300)}});
    return true;
  });
  return { subscriptionId: sub.id, donationId, result: held ? "unreachable" : "already_attempted", amountUSD, ...(held ? {error:reason} : {}) };
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
  const retryAt = nextRetryForPlan(sub, attempt, now);
  const recorded = await prisma.$transaction(async (tx) => {
    const fresh = await tx.donation.findUnique({where:{id:donationId},select:{paidAt:true,providerRaw:true}});
    if (!fresh) throw new Error("Recurring donation no longer exists");
    if (fresh.paidAt) return false;
    const raw = fresh.providerRaw && typeof fresh.providerRaw === "object" && !Array.isArray(fresh.providerRaw) ? fresh.providerRaw as Record<string, unknown> : {};
    await tx.donation.update({where:{id:donationId},data:{status:"FAILED",providerTxnResult:txnResult,providerErrorMessage:reason.slice(0,500),...(audit?{providerRaw:{...raw,...audit} as Prisma.InputJsonValue}:{})}});
    await tx.subscription.updateMany({where:{id:sub.id,status:"ACTIVE"},data:retryAt ? {chargeAttempts:attempt,nextBillingDate:retryAt,lastChargeError:reason.slice(0,300)} : {status:"PAYMENT_FAILED",chargeAttempts:attempt,lastChargeError:reason.slice(0,300)}});
    return true;
  });
  if (!recorded) return {subscriptionId:sub.id,donationId,result:"already_attempted",amountUSD};

  runAfterResponse(() => dispatchEvent("DONATION_FAILED", { donationId }));
  void sendDonationFailedConversions(donationId);
  // Exhausted retries are PAYMENT_FAILED, not a donor cancellation.
  // DONATION_FAILED above and the scheduler alert describe the actual result.

  return { subscriptionId: sub.id, donationId, result: txnResult === "Unknown" ? "unreachable" : "declined", amountUSD, error: reason };
}
