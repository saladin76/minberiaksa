import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { albarakaIsoCode, type AlbarakaServiceResponse } from "@/lib/albaraka";
import { sendDonationFailedConversions } from "@/lib/tracking/donation-conversion-server";
import { dispatchDonationPaid, dispatchEvent } from "@/lib/events/dispatch";
import { nextChargeAt, normalizeTimezone, type RecurringFrequency } from "@/lib/donations/recurring-schedule";

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
    const donation = await prisma.donation.findUnique({ where: { id: donationId } });
    if (!donation || donation.paidAt !== null) return;
    await prisma.donation.update({
      where: { id: donationId },
      data: {
        status: "FAILED",
        provider: "ALBARAKA",
        providerOrderId: donation.providerOrderId ?? orderId ?? null,
        providerTxnResult: "Failed",
        ...(responseCode ? { providerProcReturnCode: albarakaIsoCode(responseCode) } : {}),
        providerErrorMessage: reason.slice(0, 500),
        providerRaw: asJson({ ...rawObject(donation.providerRaw), ...extra }),
      },
    });
    void dispatchEvent("DONATION_FAILED", { donationId });
    // Seed Meta with the failed attempt; the browser pixel sends the matching
    // DonateFailed hit with the same `${donationId}_failed` event id.
    void sendDonationFailedConversions(donationId);
    if (donation.subscriptionId) {
      await prisma.subscription.updateMany({
        where: { id: donation.subscriptionId, lastBillingDate: null },
        data: { status: "CANCELLED", lastChargeError: reason.slice(0, 300) },
      });
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
  let newlyPaid = false;
  let subscriptionId: string | null = null;

  const settled = await prisma.$transaction(async (tx) => {
    const fresh = await tx.donation.findUnique({
      where: { id: donationId },
      include: { items: true, categoryItems: true },
    });
    if (!fresh) return false;
    if (fresh.paidAt !== null) return true;

    await tx.donation.update({
      where: { id: fresh.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        provider: "ALBARAKA",
        providerProcReturnCode: responseCode || null,
        providerTxnResult: "Success",
        providerAuthCode: sale.AuthCode ? String(sale.AuthCode) : null,
        // Albaraka's ReferenceCode is what İptal/İade are later keyed on.
        providerHostRefNum: sale.ReferenceCode ? String(sale.ReferenceCode) : null,
        providerErrorMessage: null,
        providerRaw: asJson({
          ...rawObject(fresh.providerRaw),
          ...extra,
          albarakaSale: sale as unknown as Record<string, unknown>,
        }),
      },
    });

    for (const item of fresh.items) {
      await tx.campaign.update({
        where: { id: item.campaignId },
        data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
      });
    }
    for (const item of fresh.categoryItems) {
      await tx.category.update({
        where: { id: item.categoryId },
        data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
      });
    }

    /* A plan's first instalment: the plan is live from here, and its next
       charge is computed from this settlement in its own zone. The scheduler
       (`lib/donations/albaraka-recurring.ts`) takes over. */
    if (fresh.subscriptionId) {
      const plan = await tx.subscription.findUnique({
        where: { id: fresh.subscriptionId },
        select: { id: true, frequency: true, timezone: true },
      });
      if (plan) {
        const paidAt = new Date();
        await tx.subscription.update({
          where: { id: plan.id },
          data: {
            status: "ACTIVE",
            provider: "ALBARAKA",
            lastBillingDate: paidAt,
            nextBillingDate: nextChargeAt(plan.frequency as RecurringFrequency, paidAt, normalizeTimezone(plan.timezone)),
            chargeAttempts: 0,
            lastChargeError: null,
          },
        });
      }
    }
    newlyPaid = true;
    subscriptionId = fresh.subscriptionId;
    return true;
  });

  if (newlyPaid) {
    void dispatchDonationPaid(donationId);
    if (subscriptionId) void dispatchEvent("SUBSCRIPTION_CREATED", { donationId });
  }
  return settled;
}
