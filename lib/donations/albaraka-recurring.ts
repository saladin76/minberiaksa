import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptCard } from "@/lib/card-crypto";
import {
  albarakaChargeCurrency,
  albarakaCurrencyCode,
  albarakaExpiryFromStored,
  albarakaMinorUnits,
  albarakaRecurringConfig,
  albarakaRecurringOrderId,
  albarakaService,
  buildAlbarakaRecurringSale,
  isAlbarakaApproved,
  isAlbarakaRecurringEnabled,
  isStoredCardExpired,
  type AlbarakaCurrencyCode,
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
import { nextChargeAt, nextRetryAt, normalizeTimezone, type RecurringFrequency } from "./recurring-schedule";
import { mintDonationAccessToken } from "@/lib/donations/access-token";

/**
 * The Albaraka recurring scheduler.
 *
 * A plan billed by Albaraka (`Subscription.provider = "ALBARAKA"`) paid its
 * first instalment as an ordinary 3D payment at checkout, which stored the
 * card (`paymentCardId`) and set `nextBillingDate`. From then on this job —
 * run by `/api/cron/recurring-charges` every few minutes — charges every plan
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
 *    moved to the first cycle still ahead — the donor asked for "every
 *    Friday", not for every Friday they missed.
 *  - Declines climb the retry ladder (`RECURRING_RETRY_HOURS`, default 1h,
 *    6h, 24h); when it is exhausted the plan is PAYMENT_FAILED and the donor
 *    is told. A transport failure — no answer from the bank at all — is
 *    treated as a decline for scheduling, but the row records "Unknown": the
 *    bank's status query is the way to be sure, and the reconciliation job
 *    is where that belongs.
 *  - Nothing runs unless ALBARAKA_RECURRING_ENABLED=1 and the terminal is
 *    configured. The bank must have enabled recurring / mail-order without a
 *    CVC on that terminal; until it has, a live run would only produce
 *    declines.
 */

export interface RecurringChargeOutcome {
  subscriptionId: string;
  donationId: string | null;
  result: "charged" | "declined" | "unreachable" | "card_expired" | "already_attempted" | "dry_run";
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

/** What the bank is asked to charge — converted per ALBARAKA_CHARGE_CURRENCY, in minor units. */
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

/** The first cycle still ahead of `now`, stepping from the cycle that was due. */
function nextCycleAfter(frequency: RecurringFrequency, due: Date, now: Date, timezone: string): Date {
  let next = nextChargeAt(frequency, due, timezone);
  // Bounded: a daily plan two years behind is 730 steps, which is fine; the
  // cap only guards against a clock that is wildly wrong.
  for (let i = 0; i < 2000 && next.getTime() <= now.getTime(); i += 1) {
    next = nextChargeAt(frequency, next, timezone);
  }
  return next;
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
      outcome = await chargeOne(sub, now, dryRun);
    } catch (err) {
      console.error("[albaraka-recurring] charge threw", sub.id, err);
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
  const orderId = albarakaRecurringOrderId(sub.id, due.toISOString(), attempt);
  const base: RecurringChargeOutcome = { subscriptionId: sub.id, donationId: null, result: "declined", amountUSD: null };

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
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "PAYMENT_FAILED", chargeAttempts: attempt, lastChargeError: card ? "Stored card has expired" : "No stored card" },
      });
      void dispatchEvent("SUBSCRIPTION_CANCELLED", { userId: sub.donorId });
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
      paymentMethod: "CARD",
      provider: "ALBARAKA",
      providerOrderId: orderId,
      providerTxnType: "RecurringSale",
      providerRaw: {
        albarakaRecurring: { orderId, cycle: due.toISOString(), attempt, amount, currencyCode, scheduledAt: now.toISOString() },
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
    return await recordFailure(sub, donation.id, attempt, now, "Stored card could not be decrypted", "Failed", amountUSD, err);
  }

  const cfg = albarakaRecurringConfig();
  const body = buildAlbarakaRecurringSale(
    {
      orderId,
      amount,
      currencyCode,
      card: { number: cardNumber, expireDate: albarakaExpiryFromStored(card.expiryDate), holderName: card.cardholderName ?? "" },
    },
    cfg
  );

  let sale;
  try {
    sale = await albarakaService("Sale", body, { correlationId: orderId, config: cfg });
  } catch (err) {
    return await recordFailure(sub, donation.id, attempt, now, "Bank unreachable", "Unknown", amountUSD, err);
  }

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
      sale as unknown as Record<string, unknown>
    );
  }

  // ── Settle ───────────────────────────────────────────────────────────────
  const nextBillingDate = nextCycleAfter(frequency, due, now, timezone);
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
        providerAuthCode: sale.AuthCode ? String(sale.AuthCode) : null,
        providerHostRefNum: sale.ReferenceCode ? String(sale.ReferenceCode) : null,
        providerErrorMessage: null,
        providerRaw: {
          ...(typeof fresh.providerRaw === "object" && fresh.providerRaw ? (fresh.providerRaw as Record<string, unknown>) : {}),
          albarakaSale: sale as unknown as Record<string, unknown>,
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
      data: { status: "ACTIVE", lastBillingDate: now, nextBillingDate, chargeAttempts: 0, lastChargeError: null },
    });
  });

  void dispatchDonationPaid(donation.id);
  void dispatchEvent("SUBSCRIPTION_PAYMENT", { donationId: donation.id });
  return { ...base, donationId: donation.id, result: "charged", amountUSD };
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
  raw?: Record<string, unknown>
): Promise<RecurringChargeOutcome> {
  if (err) console.error("[albaraka-recurring]", reason, sub.id, err);
  const retryAt = nextRetryAt(attempt, now);

  await prisma.$transaction([
    prisma.donation.update({
      where: { id: donationId },
      data: {
        status: "FAILED",
        providerTxnResult: txnResult,
        providerErrorMessage: reason.slice(0, 500),
        ...(raw ? { providerRaw: { albarakaSale: raw } as Prisma.InputJsonValue } : {}),
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

  return {
    subscriptionId: sub.id,
    donationId,
    result: txnResult === "Unknown" ? "unreachable" : "declined",
    amountUSD,
    error: reason,
  };
}
