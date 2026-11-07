import { inheritRecurringAttribution } from "./recurring-attribution";
import "server-only";
import { withRecurringLease } from "./recurring-lease";
import { runAfterResponse } from "@/lib/events/after-response";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptCard } from "@/lib/card-crypto";
import {
  albarakaChargeCurrency,
  albarakaCurrencyCode,
  albarakaExpiryFromStored,
  albarakaInquireSale,
  albarakaIsoCode,
  albarakaMinorUnits,
  albarakaReverseSale,
  albarakaRecurringConfig,
  albarakaRecurringOrderId,
  albarakaService,
  buildAlbarakaRecurringSale,
  isAlbarakaApproved,
  isAlbarakaRecurringEnabled,
  isAlbarakaTransportFailure,
  isStoredCardExpired,
  type AlbarakaCurrencyCode,
  type AlbarakaServiceResponse,
} from "@/lib/albaraka";
import {
  convertAmountInCurrencyToTry,
  convertAmountInCurrencyToUsd,
  getUsdBaseRatesForServer,
} from "@/lib/exchange/rates-service";
import { normalizeDonationCurrencyCode } from "@/lib/exchange/convert-amount-in-currency-to-usd";
import { getDonorCountryCodeForSnapshot } from "@/lib/donations/donor-country-code";
import { dispatchDonationPaid, dispatchEvent } from "@/lib/events/dispatch";
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";
import { nextChargeAfterPayment, nextRetryForPlan } from "./recurring-schedule";
import { inspectRecurringBillingSafety, applyRecurringBillingSafety, deferClosedFridayWindow } from "./recurring-billing-safety";
import { mintDonationAccessToken } from "@/lib/donations/access-token";

/**
 * The Albaraka recurring scheduler.
 *
 * A plan billed by Albaraka (`Subscription.provider = "ALBARAKA"`) paid its
 * first instalment as a bank-confirmed checkout payment, which stored the
 * card (`paymentCardId`) and set `nextBillingDate`. From then on this job 
 * run by `/api/cron/recurring-charges` every few minutes  charges every plan
 * whose `nextBillingDate` has passed, through the bank's direct /Sale as a
 * merchant-initiated recurring transaction, and advances the date by the
 * plan's own cadence in its own timezone (`nextChargeAt`).
 *
 * Money rules, in order of importance:
 *
 *  - Never twice for one cycle. The order id is derived from the plan, the
 *    cycle and the attempt (`albarakaRecurringOrderId`); a donation row with
 *    that id already exists → the cycle was attempted, skip. The bank refuses
 *    a reused order id as well, which is the second line.
 *  - A row before the call. The donation is written (unsettled) before the
 *    bank is asked, so a crash between the two leaves a trace, not a charge
 *    the ledger never heard of.
 *  - Missed cycles are not back-charged. A plan that fell behind (the job was
 *    down, the card was fixed a week later) charges once and its next date is
 *    moved to the first cycle still ahead  the donor asked for "every
 *    Friday", not for every Friday they missed.
 *  - Declines climb the retry ladder (`RECURRING_RETRY_HOURS`, default 1h,
 *    6h, 24h); when it is exhausted the plan is PAYMENT_FAILED and the donor
 *    is told. A transport failure  no answer from the bank at all  is
 *    treated as a decline for scheduling, but the row records "Unknown": the
 *    bank's status query is the way to be sure, and the reconciliation job
 *    is where that belongs.
 *  - Nothing runs unless ALBARAKA_RECURRING_ENABLED=1 and the terminal is
 *    configured. The bank must accept recurring payments without a
 *    CVC on that terminal; Mail Order is a separately configured transaction class; until it has, a live run would only produce
 *    declines.
 */

export interface RecurringChargeOutcome {
  subscriptionId: string;
  donationId: string | null;
  result: "charged" | "declined" | "unreachable" | "card_expired" | "already_attempted" | "dry_run" | "schedule_postponed" | "review_required";
  amountUSD: number | null;
  error?: string;
}

export interface RecurringChargeSummary {
  ranAt: string;
  dryRun: boolean;
  enabled: boolean;
  scanned: number;
  charged: RecurringChargeOutcome[];
  failed: RecurringChargeOutcome[];
  skipped: RecurringChargeOutcome[];
}

type DueSubscription = Prisma.SubscriptionGetPayload<{
  include: {
    items: true;
    categoryItems: true;
    paymentCard: true;
  };
}>;

/** What the bank is asked to charge  converted per ALBARAKA_CHARGE_CURRENCY, in minor units. */
async function chargeFor(totalAmount: number, currency: string): Promise<{ amount: number; currencyCode: AlbarakaCurrencyCode }> {
  const donationCurrency = String(currency || "TRY").toUpperCase();
  const policy = albarakaChargeCurrency();
  if (policy === "USD") {
    const rates = await getUsdBaseRatesForServer();
    return { amount: albarakaMinorUnits(convertAmountInCurrencyToUsd(totalAmount, currency, rates)), currencyCode: "US" };
  }
  if (policy === "DONOR" && ["TRY", "TL", "USD", "US", "EUR", "EU"].includes(donationCurrency)) {
    return { amount: albarakaMinorUnits(totalAmount), currencyCode: albarakaCurrencyCode(donationCurrency) };
  }
  const rates = await getUsdBaseRatesForServer();
  return { amount: albarakaMinorUnits(convertAmountInCurrencyToTry(totalAmount, currency, rates)), currencyCode: "TL" };
}

export async function chargeDueAlbarakaSubscriptions(options: { now?: Date; dryRun?: boolean; limit?: number } = {}): Promise<RecurringChargeSummary> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const cfg = albarakaRecurringConfig();

  const summary: RecurringChargeSummary = {
    ranAt: now.toISOString(),
    dryRun,
    enabled: isAlbarakaRecurringEnabled(cfg),
    scanned: 0,
    charged: [],
    failed: [],
    skipped: [],
  };
  if (!summary.enabled) return summary;

  const due = await prisma.subscription.findMany({
    where: {
      provider: "ALBARAKA",
      status: "ACTIVE",
      lastBillingDate: { not: null },
      donations: { some: { status: "PAID", paidAt: { not: null } } },
      paymentCardId: { not: null },
      nextBillingDate: { lte: now },
    },
    include: { items: true, categoryItems: true, paymentCard: true },
    orderBy: { nextBillingDate: "asc" },
    take: limit,
  });
  summary.scanned = due.length;

  for (const sub of due) {
    let outcome: RecurringChargeOutcome;
    try {
      outcome = dryRun ? await chargeOne(sub, now, true) : await withRecurringLease(prisma, sub, now, () => chargeOne(sub, now, false)) ?? { subscriptionId: sub.id, donationId: null, result: "already_attempted", amountUSD: null, error: "Billing cycle is being processed or changed" };
    } catch (err) {
      console.error("[albaraka-recurring] charge threw", sub.id, err);
      outcome = { subscriptionId: sub.id, donationId: null, result: "unreachable", amountUSD: null, error: err instanceof Error ? err.message : String(err) };
    }
    if (outcome.result === "charged") summary.charged.push(outcome);
    else if (outcome.result === "already_attempted" || outcome.result === "dry_run" || outcome.result === "schedule_postponed") summary.skipped.push(outcome);
    else summary.failed.push(outcome);
  }

  return summary;
}

type RehearsalCycle = { runId: string; cycle: number };

/** CLI-only rehearsal entry; the persistent run lock must already belong to this run. */
export async function chargeAlbarakaRehearsalCycle(subscriptionId: string, donorId: string, rehearsal: RehearsalCycle, expected: { amountMinor: number; currency: string; cardId: string; originalNextDate: string }): Promise<RecurringChargeOutcome> {
  if (![subscriptionId, donorId, rehearsal.runId].every(value => /^[a-f0-9]{24}$/.test(value)) || !Number.isInteger(rehearsal.cycle) || rehearsal.cycle < 1 || rehearsal.cycle > 3) throw new Error("INVALID_REHEARSAL");
  if (!isAlbarakaRecurringEnabled()) throw new Error("RECURRING_NOT_CONFIGURED");
  const approval = await prisma.auditLog.findUnique({ where: { id: rehearsal.runId } });
  if (!approval || approval.action !== "RECURRING_REHEARSAL_STARTED" || approval.actorId !== donorId || approval.entityId !== subscriptionId) throw new Error("REHEARSAL_APPROVAL_REQUIRED");
  const token = `RECURRING_TEST:${rehearsal.runId}`;
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, donorId, provider: "ALBARAKA", status: "ACTIVE", amountChangeLock: token }, include: { items: true, categoryItems: true, paymentCard: true } });
  if (!sub || !sub.nextBillingDate || !sub.lastBillingDate) throw new Error("REHEARSAL_PLAN_CHANGED");
  if (sub.currency !== expected.currency || sub.paymentCardId !== expected.cardId || sub.nextBillingDate.toISOString() !== expected.originalNextDate || albarakaMinorUnits(sub.amount + sub.teamSupport + (sub.coverFees ? (sub.amount + sub.teamSupport) * .03 : 0)) !== expected.amountMinor) throw new Error("REHEARSAL_PLAN_CHANGED");
  const now = new Date();
  return await withRecurringLease(prisma, sub, now, () => chargeOne(sub, now, false, rehearsal), token)
    ?? { subscriptionId, donationId: null, result: "already_attempted", amountUSD: null, error: "Rehearsal cycle is already running" };
}

async function chargeOne(sub: DueSubscription, now: Date, dryRun: boolean, rehearsal?: RehearsalCycle): Promise<RecurringChargeOutcome> {
  now = new Date(Math.max(now.getTime(), Date.now()));
  const due = sub.nextBillingDate ?? now;
  const attempt = sub.chargeAttempts + 1;
  const orderId = rehearsal ? albarakaRecurringOrderId(sub.id, `REHEARSAL:${rehearsal.runId}`, rehearsal.cycle) : albarakaRecurringOrderId(sub.id, due.toISOString(), attempt);
  const base: RecurringChargeOutcome = { subscriptionId: sub.id, donationId: null, result: "declined", amountUSD: null };

  if (!rehearsal) {
    const safety = await inspectRecurringBillingSafety(prisma, sub, now);
    if (safety.state !== "ready") {
      if (!dryRun && !await applyRecurringBillingSafety(prisma, sub, safety)) return { ...base, result: "already_attempted" };
      return { ...base, result: safety.state === "postpone" ? "schedule_postponed" : "review_required", error: safety.reason };
    }
  }

  // ── Never twice for one cycle ────────────────────────────────────────────
  const existing = await prisma.donation.findFirst({
    where: { subscriptionId: sub.id, providerOrderId: orderId },
    select: { id: true, paidAt: true },
  });
  if (existing) {
    return { ...base, donationId: existing.id, result: "already_attempted" };
  }

  // ── The card ─────────────────────────────────────────────────────────────
  const card = sub.paymentCard;
  if (!card || isStoredCardExpired(card.expiryDate, now)) {
    if (!dryRun) {
      await prisma.subscription.updateMany({
        where: { id: sub.id, status: "ACTIVE" },
        data: { status: "PAYMENT_FAILED", chargeAttempts: attempt, lastChargeError: card ? "Stored card has expired" : "No stored card" },
      });
      // Payment failure retains the plan for card replacement; it is not a donor cancellation.
    }
    return { ...base, result: "card_expired", error: card ? "card expired" : "no card" };
  }

  // ── Amounts, exactly as the webhook builds a renewal row ────────────────
  const fees = (sub.amount + sub.teamSupport) * 0.03;
  const totalAmount = sub.amount + sub.teamSupport + (sub.coverFees ? fees : 0);
  const amountUSD = sub.amountUSD ?? (normalizeDonationCurrencyCode(sub.currency) === "USD" ? sub.amount : null);
  const { amount, currencyCode } = await chargeFor(totalAmount, sub.currency);
  if (amount <= 0) {
    return { ...base, result: "declined", error: "Charge amount resolved to zero" };
  }

  if (dryRun) return { ...base, result: "dry_run", amountUSD };

  const donorCountrySnapshot = (await getDonorCountryCodeForSnapshot(prisma, sub.donorId)) ?? undefined;
  const cfg = albarakaRecurringConfig();

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
      billingReason: rehearsal ? "subscription_test_cycle" : "subscription_cycle",
      referralId: sub.referralId ?? undefined,
      paymentMethod: "CARD",
      provider: "ALBARAKA",
      providerOrderId: orderId,
      providerTxnType: "RecurringSale",
      providerTxnResult: "Pending",
      providerRaw: {
        albarakaRecurring: { merchantNo: cfg.merchantNo, terminalNo: cfg.terminalNo, orderId, cycle: due.toISOString(), attempt, amount, currencyCode, mailOrder: cfg.mailOrder === true ? "Y" : "N", recurring: "Y", cvvSent: false, scheduledAt: now.toISOString(), ...(rehearsal ? { rehearsal } : {}) },
      } as Prisma.InputJsonValue,
      items: sub.items.length
        ? { create: sub.items.map((item) => ({ campaignId: item.campaignId, amount: item.amount, amountUSD: item.amountUSD })) }
        : undefined,
      categoryItems: sub.categoryItems.length
        ? { create: sub.categoryItems.map((item) => ({ categoryId: item.categoryId, amount: item.amount, amountUSD: item.amountUSD })) }
        : undefined,
    },
    select: { id: true },
  });

  // ── The charge ───────────────────────────────────────────────────────────
  let cardNumber: string;
  try {
    cardNumber = decryptCard(card.cardNumber).replace(/\D/g, "");
  } catch (err) {
    return await recordFailure(sub, donation.id, attempt, now, "Stored card could not be decrypted", "Failed", amountUSD, err, undefined, rehearsal);
  }

  const body = buildAlbarakaRecurringSale(
    {
      orderId,
      amount,
      currencyCode,
      card: { number: cardNumber, expireDate: albarakaExpiryFromStored(card.expiryDate), holderName: card.cardholderName ?? "" },
    },
    cfg
  );

  if (!rehearsal && await deferClosedFridayWindow(prisma, sub, donation.id, new Date(Math.max(now.getTime(), Date.now())))) return {...base,donationId:donation.id,result:"schedule_postponed",error:"FRIDAY_ONLY"};

  let sale: AlbarakaServiceResponse | null = null;
  let transportError: unknown = null;
  try {
    sale = await albarakaService("Sale", body, { correlationId: orderId, config: cfg });
  } catch (err) {
    transportError = err;
  }

  /* No readable answer: the card may or may not have been charged. Retrying
     blindly would be a new order id the bank's duplicate check cannot catch, so
     the bank is asked about this order first — as the checkout does. */
  if (transportError || isAlbarakaTransportFailure(sale)) {
    const resolved = await resolveUnknownRecurringSale(orderId, cfg, transportError ?? sale, !rehearsal);
    if (resolved.state === "approved") {
      sale = resolved.sale;
    } else if (resolved.state === "not_charged") {
      return await recordFailure(sub, donation.id, attempt, now, resolved.reason, "Failed", amountUSD, transportError ?? undefined, undefined, rehearsal);
    } else {
      return await holdUnresolved(sub, donation.id, orderId, resolved.reason, amountUSD);
    }
  }
  if (!sale) {
    return await recordFailure(sub, donation.id, attempt, now, "Bank unreachable", "Unknown", amountUSD, transportError ?? undefined, undefined, rehearsal);
  }

  if (!rehearsal) now = new Date(Math.max(now.getTime(), Date.now()));
  const responseCode = sale.ServiceResponseData?.ResponseCode ?? "";
  const responseDescription = sale.ServiceResponseData?.ResponseDescription ?? "";
  if (!isAlbarakaApproved(sale)) {
    return await recordFailure(
      sub,
      donation.id,
      attempt,
      now,
      responseDescription || `Sale declined (${responseCode})`,
      "Failed",
      amountUSD,
      undefined,
      sale as unknown as Record<string, unknown>,
      rehearsal
    );
  }

  // ── Settle ───────────────────────────────────────────────────────────────
  const nextBillingDate = rehearsal ? due : nextChargeAfterPayment(sub, now);
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.donation.findUnique({ where: { id: donation.id }, include: { items: true, categoryItems: true } });
    if (!fresh || fresh.paidAt) return;
    await tx.donation.update({
      where: { id: fresh.id },
      data: {
        status: "PAID",
        paidAt: now,
        providerProcReturnCode: responseCode || null,
        providerTxnResult: "Success",
        paidAmount: amount / 100,
        paidCurrency: ({ TL: "TRY", US: "USD", EU: "EUR" } as const)[currencyCode],
        providerAuthCode: sale.AuthCode ? String(sale.AuthCode) : null,
        providerHostRefNum: sale.ReferenceCode ? String(sale.ReferenceCode) : null,
        providerErrorMessage: null,
        providerRaw: {
          ...(typeof fresh.providerRaw === "object" && fresh.providerRaw ? (fresh.providerRaw as Record<string, unknown>) : {}),
          albarakaSale: sale as unknown as Record<string, unknown>,
          cardSummary: { last4: cardNumber.slice(-4) },
        } as Prisma.InputJsonValue,
      },
    });
    for (const item of fresh.items) {
      await tx.campaign.update({ where: { id: item.campaignId }, data: { currentAmount: { increment: item.amountUSD ?? item.amount } } });
    }
    for (const item of fresh.categoryItems) {
      await tx.category.update({ where: { id: item.categoryId }, data: { currentAmount: { increment: item.amountUSD ?? item.amount } } });
    }
    await tx.subscription.update({
      where: { id: sub.id },
      data: { lastBillingDate: now, nextBillingDate, chargeAttempts: 0, lastChargeError: null },
    });
  });

  if (!rehearsal) {
    runAfterResponse(() => dispatchDonationPaid(donation.id));
    runAfterResponse(() => dispatchEvent("SUBSCRIPTION_PAYMENT", { donationId: donation.id }));
  }
  return { ...base, donationId: donation.id, result: "charged", amountUSD };
}

type UnknownSaleResolution =
  | { state: "approved"; sale: AlbarakaServiceResponse }
  | { state: "not_charged"; reason: string }
  | { state: "unresolved"; reason: string };

/**
 * A /Sale whose answer never arrived. The bank is asked by order id (/Agreement):
 * an approved sale is settled as normal, no record means nothing was taken. If
 * the bank cannot say, the order is voided (same-day /Reverse); only a confirmed
 * void counts as "not charged". Anything else is left unresolved for staff.
 */
async function resolveUnknownRecurringSale(
  orderId: string,
  cfg: ReturnType<typeof albarakaRecurringConfig>,
  cause: unknown,
  allowReverse = true
): Promise<UnknownSaleResolution> {
  console.error("[albaraka-recurring] no readable answer, inquiring", { orderId, cause: String(cause) });
  const inquiry = await albarakaInquireSale(orderId, cfg);
  if (inquiry.state === "approved") {
    return {
      state: "approved",
      sale: {
        ServiceResponseData: { ResponseCode: "00", ResponseDescription: "Approved (recovered by status inquiry)" },
        AuthCode: inquiry.authCode,
        ReferenceCode: null,
      } as AlbarakaServiceResponse,
    };
  }
  if (inquiry.state === "absent") {
    return { state: "not_charged", reason: "Bank unreachable; the bank has no record of the sale" };
  }
  if (!allowReverse) return { state: "unresolved", reason: "Rehearsal sale outcome is unknown; no retry or financial reversal was sent" };
  const reverse = await albarakaReverseSale(orderId, cfg);
  if (isAlbarakaApproved(reverse)) {
    return { state: "not_charged", reason: "Bank unreachable; the uncertain sale was voided" };
  }
  return { state: "unresolved", reason: `Outcome unknown and void not confirmed; check order ${orderId} in the merchant panel` };
}

/**
 * The bank could not say whether the card was charged and the void was not
 * confirmed. Charging again could bill the donor twice, so the plan is paused
 * (the scheduler only charges ACTIVE plans) until staff check the order in the
 * merchant panel and resume it. The donor is not told the plan was cancelled.
 */
async function holdUnresolved(
  sub: DueSubscription,
  donationId: string,
  orderId: string,
  reason: string,
  amountUSD: number | null
): Promise<RecurringChargeOutcome> {
  const held = await prisma.$transaction(async (tx) => {
    const fresh = await tx.donation.findUnique({ where: { id: donationId }, select: { paidAt: true } });
    if (!fresh) throw new Error("Recurring donation no longer exists");
    if (fresh.paidAt) return false;
    await tx.donation.update({
      where: { id: donationId },
      data: { status: "FAILED", providerTxnResult: "Unknown", providerErrorMessage: reason.slice(0, 500) },
    });
    await tx.subscription.updateMany({
      where: { id: sub.id, status: "ACTIVE" },
      data: { status: "PAUSED", lastChargeError: reason.slice(0, 300) },
    });
    return true;
  });
  if (!held) return { subscriptionId: sub.id, donationId, result: "already_attempted", amountUSD };
  console.error("[albaraka-recurring] unresolved sale, plan paused", { subscriptionId: sub.id, orderId });
  return { subscriptionId: sub.id, donationId, result: "unreachable", amountUSD, error: reason };
}

/**
 * A charge that did not go through: the row says why, the plan climbs the
 * retry ladder or stops, and the donor-facing pipeline is told.
 */
async function recordFailure(
  sub: DueSubscription,
  donationId: string,
  attempt: number,
  now: Date,
  reason: string,
  txnResult: "Failed" | "Unknown",
  amountUSD: number | null,
  err?: unknown,
  raw?: Record<string, unknown>,
  rehearsal?: RehearsalCycle
): Promise<RecurringChargeOutcome> {
  if (err) console.error("[albaraka-recurring]", reason, sub.id, err);
  const retryAt = nextRetryForPlan(sub, attempt, now);

  const recorded = await prisma.$transaction(async (tx) => {
    const fresh = await tx.donation.findUnique({ where: { id: donationId }, select: { paidAt: true, providerRaw: true } });
    if (!fresh) throw new Error("Recurring donation no longer exists");
    // Reconciliation may have confirmed this order while its original bank
    // request was still in flight. Never undo that settlement or its schedule.
    if (fresh.paidAt) return false;
    const previousRaw = typeof fresh.providerRaw === "object" && fresh.providerRaw && !Array.isArray(fresh.providerRaw)
      ? fresh.providerRaw as Record<string, unknown>
      : {};
    const response = raw?.ServiceResponseData;
    const code = typeof response === "object" && response && !Array.isArray(response)
      ? (response as Record<string, unknown>).ResponseCode
      : undefined;
    const responseCode = typeof code === "string" || typeof code === "number" ? String(code).trim() : "";
    await tx.donation.update({
      where: { id: donationId },
      data: {
        status: "FAILED",
        providerTxnResult: txnResult,
        providerErrorMessage: reason.slice(0, 500),
        ...(responseCode ? { providerProcReturnCode: albarakaIsoCode(responseCode) } : {}),
        ...(raw ? { providerRaw: { ...previousRaw, albarakaSale: raw } as Prisma.InputJsonValue } : {}),
      },
    });
    await tx.subscription.updateMany({
      where: { id: sub.id, status: "ACTIVE" },
      data: retryAt
        ? { chargeAttempts: attempt, nextBillingDate: retryAt, lastChargeError: reason.slice(0, 300) }
        : { status: "PAYMENT_FAILED", chargeAttempts: attempt, lastChargeError: reason.slice(0, 300) },
    });
    return true;
  });
  if (!recorded) return { subscriptionId: sub.id, donationId, result: "already_attempted", amountUSD };

  if (!rehearsal) {
    runAfterResponse(() => dispatchEvent("DONATION_FAILED", { donationId }));
    void sendDonationFailedConversions(donationId);
  }
  // Exhausted retries are PAYMENT_FAILED, not a donor cancellation.
  // DONATION_FAILED above and the scheduler alert describe the actual result.

  return {
    subscriptionId: sub.id,
    donationId,
    result: txnResult === "Unknown" ? "unreachable" : "declined",
    amountUSD,
    error: reason,
  };
}
