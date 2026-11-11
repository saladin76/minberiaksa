import { mixedCheckoutPayment, mixedCheckoutParent, validMixedCheckoutGroup, mixedCheckoutIds } from "./mixed-cart";
import "server-only";
import { runAfterResponse } from "@/lib/events/after-response";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { albarakaIsoCode, type AlbarakaServiceResponse } from "@/lib/albaraka";
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";
import { dispatchDonationPaid, dispatchEvent } from "@/lib/events/dispatch";
import { firstChargeForPlan, nextChargeAfterPayment } from "@/lib/donations/recurring-schedule";
import { donationFieldEmpty, donationWhereAll } from "./mongo-null";

/**
 * Settling an Albaraka charge, shared by the 2D sale (`/api/albaraka/3d/initiate`,
 * which charges directly) and the 3D callback (`/api/albaraka/3d/callback`, for
 * a 3D session already in flight).
 */

function asJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function rawObject(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};
}

/**
 * Marks the donation failed (unless it is already paid), with the reason and
 * whatever the bank sent. A plan whose first instalment failed was never
 * activated, so it is closed rather than left for the scheduler to bill.
 */
export async function failAlbarakaDonation(
  donationId: string,
  reason: string,
  extra: Record<string, unknown> = {},
  orderId?: string,
  /** The bank's ResponseCode, kept so the failure page can explain the decline. */
  responseCode?: string
): Promise<void> {
  console.error("[Albaraka] donation failed:", donationId, reason);
  try {
    const failedIds: string[] = [];
    await prisma.$transaction(async tx => {
      const donation = await tx.donation.findUnique({ where: { id: donationId } });
      if (!donation || donation.paidAt != null || mixedCheckoutParent(donation.providerRaw)) return;
      const link = mixedCheckoutPayment(donation.providerRaw);
      const children = link ? (await Promise.all(mixedCheckoutIds(donation.providerRaw).map(id => tx.donation.findUnique({ where: { id } })))).filter(row => row !== null) : [];
      if (link && (!validMixedCheckoutGroup(donation, children) || children.some(row => row.paidAt))) throw new Error("INVALID_MIXED_CHECKOUT");
      for (const row of [donation, ...children]) {
        const failed = await tx.donation.updateMany({
          where: donationWhereAll({ id: row.id, status: { not: "FAILED" } }, donationFieldEmpty("paidAt")),
          data: { status: "FAILED", provider: "ALBARAKA", providerOrderId: donation.providerOrderId ?? orderId ?? null,
            providerTxnResult: "Failed", ...(responseCode ? { providerProcReturnCode: albarakaIsoCode(responseCode) } : {}),
            providerErrorMessage: reason.slice(0, 500), providerRaw: asJson({ ...rawObject(row.providerRaw), ...extra }) },
        });
        if (failed.count) failedIds.push(row.id);
      }
      for (const row of [donation, ...children]) if (row.subscriptionId) await tx.subscription.updateMany({
        where: { id: row.subscriptionId, lastBillingDate: null, status: "ACTIVE" },
        data: { status: "PAYMENT_FAILED", lastChargeError: reason.slice(0, 300) },
      });
    });
    for (const id of failedIds) {
      runAfterResponse(() => dispatchEvent("DONATION_FAILED", { donationId: id }));
      void sendDonationFailedConversions(id);
    }
  } catch (e) {
    console.error("[Albaraka] failure bookkeeping error:", e);
  }
}

/**
 * Marks an approved sale PAID, counts it towards its campaigns and categories,
 * and (a plan's first instalment) starts the plan. Runs in one transaction that
 * re-checks `paidAt`, so two settlements racing each other count once.
 */
export async function settleAlbarakaDonation(
  donationId: string,
  sale: AlbarakaServiceResponse,
  extra: Record<string, unknown> = {}
): Promise<boolean> {
  const responseCode = sale.ServiceResponseData?.ResponseCode ?? "";
  // Each transaction attempt must own its event lists. When Mongo rolls back
  // P2034, effects collected by the failed attempt must not escape the retry.
  const settleOnce = async () => {
    let newlyPaid = false;
    const paidIds: string[] = [];
    const activatedIds: string[] = [];

    const settled = await prisma.$transaction(async (tx) => {
    const fresh = await tx.donation.findUnique({
      where: { id: donationId },
      include: { items: true, categoryItems: true },
    });
    if (!fresh) return false;
    if (fresh.paidAt != null) return true;
    if (mixedCheckoutParent(fresh.providerRaw)) return false;
    const link = mixedCheckoutPayment(fresh.providerRaw);
    const children = link ? (await Promise.all(mixedCheckoutIds(fresh.providerRaw).map(id => tx.donation.findUnique({ where: { id }, include: { items: true, categoryItems: true } })))).filter(row => row !== null) : [];
    if (link && (!validMixedCheckoutGroup(fresh, children) || children.some(row => row.paidAt))) throw new Error("INVALID_MIXED_CHECKOUT");
    const requestSnapshot = rawObject(rawObject(fresh.providerRaw).albarakaRequest);
    const bankAmount = Number(requestSnapshot.amount);
    const bankCurrency = ({ TL: "TRY", US: "USD", EU: "EUR" } as Record<string, string>)[String(requestSnapshot.currencyCode)];

    if (link && (!Number.isSafeInteger(bankAmount) || bankAmount <= 0 || !bankCurrency)) throw new Error("MISSING_MIXED_PAYMENT_CONFIRMATION");
    let remainingMinor = bankAmount;
    const rows = [fresh, ...children];
    for (const [index, row] of rows.entries()) {
      const allocatedMinor = index === rows.length - 1 ? remainingMinor : Math.round(bankAmount * row.totalAmount / (link?.totalAmount ?? fresh.totalAmount));
      remainingMinor -= allocatedMinor;
      await tx.donation.update({
        where: { id: row.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          provider: "ALBARAKA",
          providerProcReturnCode: responseCode || null,
          providerTxnResult: "Success",
          ...(Number.isSafeInteger(bankAmount) && bankAmount > 0 && bankCurrency ? { paidAmount: allocatedMinor / 100, paidCurrency: bankCurrency } : {}),
          ...(children.length ? { providerOrderId: fresh.providerOrderId } : {}),
          providerAuthCode: sale.AuthCode ? String(sale.AuthCode) : null,
          // Albaraka's ReferenceCode is what İptal/İade are later keyed on.
          providerHostRefNum: sale.ReferenceCode ? String(sale.ReferenceCode) : null,
          providerErrorMessage: null,
          providerRaw: asJson({
            ...rawObject(row.providerRaw),
            ...extra,
            ...(children.length ? { albarakaRequest: requestSnapshot, sharedPayment: { parentDonationId: fresh.id, totalPaidMinor: bankAmount } } : {}),
            albarakaSale: sale as unknown as Record<string, unknown>,
          }),
        },
      });

      for (const item of row.items) {
        await tx.campaign.update({
          where: { id: item.campaignId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }
      for (const item of row.categoryItems) {
        await tx.category.update({
          where: { id: item.categoryId },
          data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
        });
      }

      paidIds.push(row.id);
    }

    /* A plan's first instalment: the plan is live from here, and its next
       charge is the first slot of its own rule (the donor's chosen day and
       time) after this settlement. The scheduler
       (`lib/donations/albaraka-recurring.ts`) takes over. */
    for (const row of rows) if (row.subscriptionId) {
      const plan = await tx.subscription.findUnique({
        where: { id: row.subscriptionId },
        select: { id: true, frequency: true, timezone: true, scheduleRule: true, lastBillingDate: true, status: true },
      });
      if (plan) {
        const paidAt = new Date();
        const initial = !plan.lastBillingDate;
        const activated = initial && (plan.status === "ACTIVE" || plan.status === "PAYMENT_FAILED");
        if (activated) activatedIds.push(row.id);
        await tx.subscription.update({
          where: { id: plan.id },
          data: {
            ...(activated ? {status: "ACTIVE", provider: "ALBARAKA"} : {}),
            lastBillingDate: plan.lastBillingDate && plan.lastBillingDate > paidAt ? plan.lastBillingDate : paidAt,
            nextBillingDate: initial ? firstChargeForPlan(plan, paidAt) : nextChargeAfterPayment(plan, paidAt),
            chargeAttempts: 0,
            lastChargeError: null,
          },
        });
      }
    }
    newlyPaid = true;
    return true;
    }, { timeout: 30_000, maxWait: 10_000 });
    return { settled, newlyPaid, paidIds, activatedIds };
  };

  // Retry only Mongo's known write-conflict/deadlock error. The bank sale is
  // never re-submitted: this retries ONLY the atomic local ledger transaction.
  // Every attempt re-reads paidAt to prevent duplicate campaign increments.
  let outcome: Awaited<ReturnType<typeof settleOnce>> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      outcome = await settleOnce();
      break;
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2034" || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  if (!outcome) throw new Error("ALBARAKA_SETTLEMENT_RETRY_EXHAUSTED");
  if (outcome.newlyPaid) {
    for (const id of outcome.paidIds) runAfterResponse(() => dispatchDonationPaid(id));
    for (const id of outcome.activatedIds) runAfterResponse(() => dispatchEvent("SUBSCRIPTION_CREATED", { donationId: id }));
  }
  return outcome.settled;
}
