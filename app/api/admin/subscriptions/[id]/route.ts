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

/** Returns the next billing date: one month from today, clamped to the target month's last day. */
function nextBillingInOneMonth(): Date {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

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
      select: { id: true, status: true },
    });

    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const nextStatus = status as SubscriptionStatus;
    const data: {
      status: SubscriptionStatus;
      nextBillingDate?: Date;
    } = { status: nextStatus };

    if (nextStatus === "ACTIVE" && sub.status !== "ACTIVE") {
      // Stripe owns the real cadence; seed nextBillingDate so list filters work.
      data.nextBillingDate = nextBillingInOneMonth();
    }

    await prisma.subscription.update({
      where: { id },
      data,
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "SUBSCRIPTION_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} غيّر حالة الاشتراك إلى ${nextStatus}`,
      messageEn: `${actor.actorName ?? "Admin"} set subscription status to ${nextStatus}`,
      entityType: "Subscription",
      entityId: id,
      metadata: { status: nextStatus },
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
      nextBillingDate: row.nextBillingDate,
      lastBillingDate: row.lastBillingDate,
      donor: row.donor,
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
