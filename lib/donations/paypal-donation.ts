import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PayPalError,
  capturePayPalOrder,
  createPayPalOrder,
  getPayPalOrder,
  isPayPalConfigured,
  isPayPalRecurringEnabled,
  paypalAmountsMatch,
  paypalApproveUrl,
  paypalAuditView,
  paypalCaptureOf,
  paypalChargeFor,
  paypalVaultOf,
  type PayPalOrder,
} from "@/lib/paypal";
import { firstChargeForSettledPlan } from "@/lib/donations/prayer-time-schedule";
import { dispatchDonationPaid, dispatchEvent } from "@/lib/events/dispatch";
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";

/**
 * A donation paid with PayPal, from the checkout to PAID.
 *
 *   checkout creates the donation (PENDING: status PAID, paidAt null)
 *   → startPayPalCheckout: the amount and currency are read from the
 *     donation row, never from the browser, and a PayPal order is created
 *     (PayPal-Request-Id = the donation id, so a double click is one order)
 *   → the donor approves on PayPal and is sent back to /api/paypal/return
 *   → completePayPalReturn: capture (PayPal-Request-Id again), then verify
 *     order id, custom_id, amount, currency and COMPLETED before settling.
 *
 * The success page is never the proof: only a COMPLETED capture that passes
 * every check sets `paidAt`. A donation that already has `paidAt` is never
 * captured again.
 *
 * A recurring plan's first instalment also vaults the donor's PayPal wallet;
 * the vault id goes on the plan and `lib/donations/paypal-recurring.ts`
 * charges every later cycle against it.
 */

type Snapshot = { orderId?: string; value?: string; currency?: string; vault?: boolean };

function providerRawObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function snapshotOf(raw: unknown): Snapshot {
  const req = providerRawObject(raw).paypalRequest;
  return req && typeof req === "object" ? (req as Snapshot) : {};
}

// ── Start ───────────────────────────────────────────────────────────────────

export type StartResult =
  | { ok: true; approveUrl: string }
  | { ok: false; status: number; error: string };

export async function startPayPalCheckout(input: {
  donationId: string;
  origin: string;
  locale: string;
}): Promise<StartResult> {
  if (!isPayPalConfigured()) return { ok: false, status: 503, error: "PayPal is not available at the moment" };

  const donation = await prisma.donation.findUnique({
    where: { id: input.donationId },
    select: {
      id: true,
      status: true,
      paidAt: true,
      totalAmount: true,
      currency: true,
      paymentMethod: true,
      providerRaw: true,
      subscriptionId: true,
    },
  });
  if (!donation) return { ok: false, status: 404, error: "Donation not found" };
  if (donation.paymentMethod !== "PAYPAL") return { ok: false, status: 400, error: "This donation is not a PayPal donation" };
  if (donation.paidAt) return { ok: false, status: 409, error: "Donation is already paid" };
  if (donation.status === "FAILED") return { ok: false, status: 400, error: "Donation has already failed" };

  const recurring = Boolean(donation.subscriptionId);
  if (recurring && !isPayPalRecurringEnabled()) {
    return { ok: false, status: 400, error: "Recurring donations with PayPal are not available at the moment" };
  }

  const charge = await paypalChargeFor(donation.totalAmount, donation.currency);
  if (!(Number(charge.value) > 0)) return { ok: false, status: 400, error: "Invalid donation amount" };

  const query = `donationId=${encodeURIComponent(donation.id)}&locale=${encodeURIComponent(input.locale)}`;
  const order = await createPayPalOrder({
    donationId: donation.id,
    value: charge.value,
    currency: charge.currency,
    returnUrl: `${input.origin}/api/paypal/return?${query}`,
    cancelUrl: `${input.origin}/api/paypal/cancel?${query}`,
    vault: recurring,
    requestId: `order-${donation.id}`,
  });

  const approveUrl = paypalApproveUrl(order);
  if (!approveUrl) {
    console.error("[paypal] order has no approval link", paypalAuditView(order));
    return { ok: false, status: 502, error: "PayPal did not return an approval link" };
  }

  /* The snapshot the return route verifies against: which order, for how
     much, in which currency. Written before the donor leaves. */
  await prisma.donation.update({
    where: { id: donation.id },
    data: {
      provider: "PAYPAL",
      providerOrderId: order.id,
      paypalOrderId: order.id,
      providerTxnType: "Capture",
      providerTxnResult: "Pending",
      providerRaw: {
        ...providerRawObject(donation.providerRaw),
        paypalRequest: { orderId: order.id, value: charge.value, currency: charge.currency, vault: recurring, createdAt: new Date().toISOString() },
      } as Prisma.InputJsonValue,
    },
  });

  return { ok: true, approveUrl };
}

// ── Return ──────────────────────────────────────────────────────────────────

export type ReturnResult =
  | { kind: "paid"; accessToken: string | null }
  | { kind: "pending"; accessToken: string | null }
  | { kind: "failed"; reason: string };

export async function completePayPalReturn(input: { donationId: string; orderId: string }): Promise<ReturnResult> {
  const donation = await prisma.donation.findUnique({
    where: { id: input.donationId },
    select: { id: true, paidAt: true, status: true, accessToken: true, paypalOrderId: true, providerRaw: true, subscriptionId: true },
  });
  if (!donation) return { kind: "failed", reason: "Donation not found" };

  // Never capture twice: a paid donation is simply shown as paid.
  if (donation.paidAt) return { kind: "paid", accessToken: donation.accessToken };

  const snapshot = snapshotOf(donation.providerRaw);
  const expectedOrderId = donation.paypalOrderId ?? snapshot.orderId ?? "";
  if (!expectedOrderId || !input.orderId || expectedOrderId !== input.orderId) {
    return await failDonation(donation.id, `PayPal order mismatch (expected ${expectedOrderId || "none"}, got ${input.orderId || "none"})`);
  }
  if (donation.status === "FAILED") return { kind: "failed", reason: "Donation has already failed" };

  let order: PayPalOrder;
  try {
    order = await capturePayPalOrder(expectedOrderId, `capture-${donation.id}`);
  } catch (err) {
    if (err instanceof PayPalError && err.issue === "ORDER_ALREADY_CAPTURED") {
      // Captured by an earlier request whose answer we lost: read the result.
      order = await getPayPalOrder(expectedOrderId);
    } else if (err instanceof PayPalError && (err.issue === "INSTRUMENT_DECLINED" || err.issue === "PAYER_ACTION_REQUIRED")) {
      return await failDonation(donation.id, `PayPal declined the payment (${err.issue})`, { paypalError: err.body });
    } else {
      /* Unknown outcome (network, 5xx): leave the donation pending rather
         than failing a payment that may have gone through. The same capture
         request id makes a later retry safe. */
      console.error("[paypal] capture error", donation.id, err);
      return { kind: "pending", accessToken: donation.accessToken };
    }
  }

  return await verifyAndSettle(donation.id, order, snapshot);
}

/**
 * Every check before money is counted, then the settlement. Shared by the
 * return route; the scheduler has its own copy of the checks because its
 * order is created and captured in one call.
 */
async function verifyAndSettle(donationId: string, order: PayPalOrder, snapshot: Snapshot): Promise<ReturnResult> {
  const capture = paypalCaptureOf(order);
  const customId = order.purchase_units?.[0]?.custom_id ?? capture?.custom_id ?? "";
  const audit = { paypalCapture: paypalAuditView(order) };

  if (order.id !== snapshot.orderId) return await failDonation(donationId, "PayPal order id changed", audit);
  if (customId !== donationId) return await failDonation(donationId, `PayPal custom_id mismatch (${customId || "none"})`, audit);
  if (!capture) return await failDonation(donationId, `PayPal returned no capture (order ${order.status})`, audit);

  if (capture.status === "PENDING") {
    /* PayPal holds some payments for review (e.g. an eCheck). Not COMPLETED,
       so not paid; it stays pending for the finance team to follow up. */
    await prisma.donation.update({
      where: { id: donationId },
      data: {
        paypalCaptureId: capture.id,
        providerTxnResult: "Pending",
        providerErrorMessage: "PayPal capture is pending review",
        providerRaw: { ...(await rawOf(donationId)), ...audit } as Prisma.InputJsonValue,
      },
    });
    const row = await prisma.donation.findUnique({ where: { id: donationId }, select: { accessToken: true } });
    return { kind: "pending", accessToken: row?.accessToken ?? null };
  }
  if (order.status !== "COMPLETED" || capture.status !== "COMPLETED") {
    return await failDonation(donationId, `PayPal capture not completed (order ${order.status}, capture ${capture.status})`, audit);
  }
  if (capture.amount?.currency_code !== snapshot.currency) {
    return await failDonation(donationId, `PayPal currency mismatch (expected ${snapshot.currency}, got ${capture.amount?.currency_code})`, audit);
  }
  if (!capture.amount || !paypalAmountsMatch(capture.amount.value, snapshot.value)) {
    return await failDonation(donationId, `PayPal amount mismatch (expected ${snapshot.value}, got ${capture.amount?.value})`, audit);
  }

  const vault = paypalVaultOf(order);
  const settled = await settlePayPalDonation({
    donationId,
    orderId: order.id,
    captureId: capture.id,
    paidAmount: Number(capture.amount.value),
    paidCurrency: capture.amount.currency_code,
    audit,
    vault,
  });
  if (!settled.ok) return { kind: "failed", reason: "Donation not found" };

  if (!settled.alreadyPaid) {
    void dispatchDonationPaid(donationId);
    if (settled.subscriptionActivated) void dispatchEvent("SUBSCRIPTION_CREATED", { donationId });
  }
  return { kind: "paid", accessToken: settled.accessToken };
}

async function rawOf(donationId: string): Promise<Record<string, unknown>> {
  const row = await prisma.donation.findUnique({ where: { id: donationId }, select: { providerRaw: true } });
  return providerRawObject(row?.providerRaw);
}

/**
 * Mark the donation PAID, count it towards its campaigns and categories, and
 * (first instalment of a plan) start the plan with the vaulted wallet. Runs
 * in one transaction and re-checks `paidAt` inside it, so two returns racing
 * each other settle once.
 */
export async function settlePayPalDonation(input: {
  donationId: string;
  orderId: string;
  captureId: string;
  paidAmount: number;
  paidCurrency: string;
  audit: Record<string, unknown>;
  vault: { id: string; customerId: string | null } | null;
  paidAt?: Date;
}): Promise<{ ok: false } | { ok: true; alreadyPaid: boolean; accessToken: string | null; subscriptionActivated: boolean }> {
  const paidAt = input.paidAt ?? new Date();
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.donation.findUnique({
      where: { id: input.donationId },
      include: { items: true, categoryItems: true },
    });
    if (!fresh) return { ok: false as const };
    if (fresh.paidAt) return { ok: true as const, alreadyPaid: true, accessToken: fresh.accessToken, subscriptionActivated: false };

    await tx.donation.update({
      where: { id: fresh.id },
      data: {
        status: "PAID",
        paidAt,
        paymentMethod: "PAYPAL",
        provider: "PAYPAL",
        providerOrderId: fresh.providerOrderId ?? input.orderId,
        paypalOrderId: input.orderId,
        paypalCaptureId: input.captureId,
        providerHostRefNum: input.captureId,
        providerTxnResult: "Success",
        providerErrorMessage: null,
        paidAmount: input.paidAmount,
        paidCurrency: input.paidCurrency,
        providerRaw: { ...providerRawObject(fresh.providerRaw), ...input.audit } as Prisma.InputJsonValue,
      },
    });

    for (const item of fresh.items) {
      await tx.campaign.update({ where: { id: item.campaignId }, data: { currentAmount: { increment: item.amountUSD ?? item.amount } } });
    }
    for (const item of fresh.categoryItems) {
      await tx.category.update({ where: { id: item.categoryId }, data: { currentAmount: { increment: item.amountUSD ?? item.amount } } });
    }

    /* A plan's first instalment: the plan runs from this payment, on the
       wallet PayPal just saved. Without a vault id nothing could be charged
       next cycle, so the plan is stopped with the reason rather than left
       ACTIVE and silently never billed. */
    let subscriptionActivated = false;
    if (fresh.subscriptionId) {
      const plan = await tx.subscription.findUnique({
        where: { id: fresh.subscriptionId },
        select: { id: true, frequency: true, timezone: true, scheduleRule: true, nextBillingDate: true, lastBillingDate: true },
      });
      if (plan && plan.lastBillingDate === null) {
        if (input.vault) {
          const nextBillingDate = firstChargeForSettledPlan(plan, paidAt);
          await tx.subscription.update({
            where: { id: plan.id },
            data: {
              status: nextBillingDate ? "ACTIVE" : "PAUSED",
              provider: "PAYPAL",
              paypalVaultId: input.vault.id,
              paypalCustomerId: input.vault.customerId,
              lastBillingDate: paidAt,
              // The first slot of the plan's own rule after this payment.
              nextBillingDate,
              chargeAttempts: 0,
              lastChargeError: nextBillingDate ? null : "PRAYER_NEXT_CHARGE_REQUIRES_REVIEW",
            },
          });
          subscriptionActivated = nextBillingDate !== null;
        } else {
          console.error("[paypal] first instalment settled without a vaulted wallet", fresh.id);
          await tx.subscription.update({
            where: { id: plan.id },
            data: {
              status: "PAYMENT_FAILED",
              provider: "PAYPAL",
              lastBillingDate: paidAt,
              lastChargeError: "PayPal did not save the wallet for later charges",
            },
          });
        }
      }
    }

    return { ok: true as const, alreadyPaid: false, accessToken: fresh.accessToken, subscriptionActivated };
  });
}

// ── Failure / cancel ────────────────────────────────────────────────────────

async function failDonation(donationId: string, reason: string, extra: Record<string, unknown> = {}): Promise<ReturnResult> {
  console.error("[paypal] donation failed:", donationId, reason);
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { paidAt: true, status: true, providerRaw: true, subscriptionId: true },
  });
  if (!donation || donation.paidAt) return { kind: "failed", reason };
  if (donation.status !== "FAILED") {
    await prisma.donation.update({
      where: { id: donationId },
      data: {
        status: "FAILED",
        provider: "PAYPAL",
        providerTxnResult: "Failed",
        providerErrorMessage: reason.slice(0, 500),
        providerRaw: { ...providerRawObject(donation.providerRaw), ...extra } as Prisma.InputJsonValue,
      },
    });
    void dispatchEvent("DONATION_FAILED", { donationId });
    void sendDonationFailedConversions(donationId);
  }
  /* A plan whose first instalment never settled was never started. */
  if (donation.subscriptionId) {
    await prisma.subscription.updateMany({
      where: { id: donation.subscriptionId, lastBillingDate: null },
      data: { status: "CANCELLED", lastChargeError: reason.slice(0, 300) },
    });
  }
  return { kind: "failed", reason };
}

/** The donor pressed "cancel" on PayPal. Only the order we created can cancel it. */
export async function cancelPayPalCheckout(input: { donationId: string; orderId: string }): Promise<void> {
  const donation = await prisma.donation.findUnique({
    where: { id: input.donationId },
    select: { paidAt: true, paypalOrderId: true },
  });
  if (!donation || donation.paidAt) return;
  if (!donation.paypalOrderId || donation.paypalOrderId !== input.orderId) return;
  await failDonation(input.donationId, "Donor cancelled on PayPal");
}
