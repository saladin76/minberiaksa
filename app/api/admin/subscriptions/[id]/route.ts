import { NextRequest, NextResponse } from "next/server";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  writeAuditLog,
  auditActorFromDashboardSession,
} from "@/lib/audit-log";
import { nextChargeAt, normalizeTimezone, type RecurringFrequency } from "@/lib/donations/recurring-schedule";
import {
  applyPlanStatusAtProvider,
  ProviderSyncError,
  type PlanStatus,
  type ProviderResult,
} from "@/lib/donations/subscription-provider-control";

/** PATCH /api/admin/subscriptions/[id] — set status (ACTIVE | PAUSED | CANCELLED); dashboard monthly permission */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "monthly");
    if (denied) return denied;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Subscription id required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const status = body?.status as string | undefined;

    if (!["ACTIVE", "PAUSED", "CANCELLED"].includes(String(status))) {
      return NextResponse.json(
        { error: "Invalid status; use ACTIVE, PAUSED or CANCELLED" },
        { status: 400 }
      );
    }

    const sub = await prisma.subscription.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        frequency: true,
        timezone: true,
        provider: true,
        stripeSubscriptionId: true,
        payforToken: true,
      },
    });

    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const nextStatus = status as SubscriptionStatus;

    if (sub.status === "CANCELLED" && nextStatus !== "CANCELLED") {
      return NextResponse.json(
        { error: "A cancelled plan cannot be reactivated. The donor must start a new plan." },
        { status: 409 }
      );
    }

    // The provider first. If Stripe refuses, nothing local changes and the
    // dashboard shows the failure instead of a status that is not true.
    let provider: ProviderResult;
    try {
      provider = await applyPlanStatusAtProvider(sub, nextStatus as PlanStatus);
    } catch (err) {
      if (err instanceof ProviderSyncError) {
        return NextResponse.json(
          { error: err.message, code: err.code, providerConfirmed: false },
          { status: err.httpStatus }
        );
      }
      throw err;
    }
    const data: {
      status: SubscriptionStatus;
      nextBillingDate?: Date;
    } = { status: nextStatus };

    if (nextStatus === "ACTIVE" && sub.status !== "ACTIVE") {
      // Stripe owns the real cadence; seed nextBillingDate at the plan's own
      // frequency and zone so list filters work until the next paid invoice.
      data.nextBillingDate = nextChargeAt(sub.frequency as RecurringFrequency, new Date(), normalizeTimezone(sub.timezone));
    }

    await prisma.subscription.update({
      where: { id },
      data,
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "SUBSCRIPTION_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} غيّر حالة الاشتراك من ${sub.status} إلى ${nextStatus} (${provider.rail === "STRIPE" ? `تأكيد Stripe: ${provider.providerStatus}${provider.providerPaused ? "، متوقف مؤقتًا" : ""}` : provider.rail === "ALBARAKA" ? "جدولة البركة داخلية" : "لا يوجد اشتراك لدى مزوّد الدفع"})`,
      messageEn: `${actor.actorName ?? "Admin"} set subscription status ${sub.status} → ${nextStatus} (provider: ${provider.rail}${provider.providerStatus ? `, Stripe status ${provider.providerStatus}` : ""})`,
      entityType: "Subscription",
      entityId: id,
      metadata: {
        before: sub.status,
        after: nextStatus,
        rail: provider.rail,
        stripeSubscriptionId: provider.stripeSubscriptionId,
        providerStatus: provider.providerStatus,
        providerPaused: provider.providerPaused,
      },
      stream: "TEAM",
    });

    const row = await prisma.subscription.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        amount: true,
        amountUSD: true,
        currency: true,
        createdAt: true,
        frequency: true,
        nextBillingDate: true,
        lastBillingDate: true,
        donor: { select: { id: true, name: true, email: true } },
        items: { select: { campaign: { select: { id: true, title: true } } } },
        categoryItems: { select: { category: { select: { id: true, name: true } } } },
      },
    });

    if (!row) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const payload = {
      id: row.id,
      status: row.status,
      amount: row.amount,
      amountUSD: row.amountUSD,
      currency: row.currency,
      createdAt: row.createdAt,
      frequency: row.frequency,
      nextBillingDate: row.nextBillingDate,
      lastBillingDate: row.lastBillingDate,
      donor: row.donor,
      provider: {
        rail: provider.rail,
        confirmed: true,
        status: provider.providerStatus ?? null,
        paused: provider.providerPaused ?? null,
      },
      campaigns: row.items.map((i) => ({ id: i.campaign.id, title: i.campaign.title })),
      categories: row.categoryItems.map((c) => ({
        id: c.category.id,
        name: c.category.name,
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error updating subscription:", error);
    return NextResponse.json(
      {
        error: "Failed to update subscription",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
