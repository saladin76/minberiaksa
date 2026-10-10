import { NextRequest, NextResponse } from "next/server";
import { SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { planRail } from "@/lib/donations/subscription-provider-control";
import { convertAmountInCurrencyToUsd } from "@/lib/exchange/convert-amount-in-currency-to-usd";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  writeAuditLog,
  auditActorFromDashboardSession,
} from "@/lib/audit-log";
import { nextChargeForPlan } from "@/lib/donations/recurring-schedule";
import {
  applyPlanStatusAtProvider,
  ProviderSyncError,
  type PlanStatus,
  type ProviderResult,
} from "@/lib/donations/subscription-provider-control";

/** PATCH /api/admin/subscriptions/[id]  set status (ACTIVE | PAUSED | CANCELLED); dashboard monthly permission */
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
    const loweringAmount = body?.amount !== undefined;
    if (loweringAmount && status !== undefined) return NextResponse.json({ error: "Change either amount or status, not both" }, { status: 400 });

    if (!loweringAmount && !["ACTIVE", "PAUSED", "CANCELLED"].includes(String(status))) {
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
        amount: true,
        currency: true,
        teamSupport: true,
        coverFees: true,
        nextBillingDate: true,
        chargeAttempts: true,
        amountChangeLock: true,
        items: { select: { id: true, amount: true, amountUSD: true } },
        categoryItems: { select: { id: true, amount: true, amountUSD: true } },
        frequency: true,
        timezone: true,
        scheduleRule: true,
        provider: true,
        stripeSubscriptionId: true,
        payforToken: true,
      },
    });

    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (loweringAmount) {
      const amount = body.amount;
      const evidence = typeof body.consentEvidence === "string" ? body.consentEvidence.trim() : "";
      const proofType = body.consentMethod;
      if (!Number.isFinite(amount) || amount < 1 || Math.round(amount * 100) !== amount * 100 || amount >= sub.amount ||
          evidence.length < 12 || evidence.length > 2000 || !["PHONE", "EMAIL", "WHATSAPP", "SIGNED"].includes(proofType)) {
        return NextResponse.json({ error: "Enter a lower amount of at least 1, and documented donor consent (method + reference)" }, { status: 400 });
      }
      if (sub.status !== "ACTIVE" && sub.status !== "PAUSED") {
        return NextResponse.json({ error: "Only active or paused plans can be reduced" }, { status: 409 });
      }
      // Prevent editing a due/retrying charge while a scheduled worker might
      // already have loaded the old amount. Defer the request for review.
      if (!sub.nextBillingDate || sub.nextBillingDate.getTime() - Date.now() < 24 * 3600_000 || sub.chargeAttempts) {
        return NextResponse.json({ error: "Billing is due soon, already pending, or under retry. Schedule a reduction after this cycle settles.", code: "BILLING_WINDOW_LOCKED" }, { status: 409 });
      }
      const newAmount = Math.round(amount * 100) / 100;
      const usd = await convertAmountInCurrencyToUsd(newAmount, sub.currency);
      // Preserve all existing projects/categories with proportional amounts.
      const entries = [...sub.items.map((x) => ({ ...x, kind: "item" as const })),
        ...sub.categoryItems.map((x) => ({ ...x, kind: "category" as const }))];
      if (!entries.length) return NextResponse.json({ error: "Plan allocations are missing, review manually" }, { status: 409 });
      const oldAllocTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
      if (!(oldAllocTotal > 0)) return NextResponse.json({ error: "Plan allocations are invalid" }, { status: 409 });
      const allocCents = Math.round(newAmount * 100);
      let distributed = 0;
      const allocations = entries.map((entry, index) => {
        const cents = index === entries.length - 1 ? allocCents - distributed : Math.round(allocCents * entry.amount / oldAllocTotal);
        distributed += cents;
        return { ...entry, amount: cents / 100 };
      });
      if (allocations.some((x) => x.amount <= 0)) return NextResponse.json({ error: "The lower amount is too small for the current number of projects" }, { status: 400 });
      const rail = planRail(sub);
      if (rail === "NONE") return NextResponse.json({ error: "Plan has no payment authorization" }, { status: 409 });
      if (sub.amountChangeLock) return NextResponse.json({ error: "Previous change requires reconciliation", code: "RECONCILE_REQUIRED" }, { status: 409 });
      const token = randomUUID();
      const lock = await prisma.subscription.updateMany({
        where: { id: sub.id, amount: sub.amount, status: sub.status, nextBillingDate: sub.nextBillingDate, chargeAttempts: 0, OR: [{ amountChangeLock: null }, { amountChangeLock: { isSet: false } }] },
        data: { amountChangeLock: token, amountChangeStartedAt: new Date() },
      });
      if (lock.count !== 1) return NextResponse.json({ error: "Plan changed concurrently" }, { status: 409 });
      const unlock = async () => { await prisma.subscription.updateMany({ where: { id: sub.id, amountChangeLock: token }, data: { amountChangeLock: null, amountChangeStartedAt: null } }); };
      let providerUpdated = false;
      if (rail === "STRIPE") {
        const stripeId = sub.stripeSubscriptionId ?? sub.payforToken;
        if (!stripeId || !process.env.STRIPE_SECRET_KEY) { await unlock(); return NextResponse.json({ error: "Stripe subscription is not configured" }, { status: 503 }); }
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
          const live = await stripe.subscriptions.retrieve(stripeId);
          if (live.status !== "active" || live.pause_collection || live.items.data.length !== 1 || live.currency.toUpperCase() !== sub.currency.toUpperCase()) {
            await unlock();
            return NextResponse.json({ error: "Stripe billing state, currency or item count differs; reconciliation required" }, { status: 409 });
          }
          const item = live.items.data[0];
          const previousTotal = sub.amount + sub.teamSupport + (sub.coverFees ? (sub.amount + sub.teamSupport) * 0.03 : 0);
          if (Math.abs((item.price.unit_amount ?? -99999) - Math.round(previousTotal * 100)) > 1 || item.price.recurring?.interval !== "month") {
            await unlock();
            return NextResponse.json({ error: "Stripe price differs from plan, or unsupported cadence", code: "RECONCILE_REQUIRED" }, { status: 409 });
          }
          const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
          const total = newAmount + sub.teamSupport + (sub.coverFees ? (newAmount + sub.teamSupport) * 0.03 : 0);
          await stripe.subscriptions.update(stripeId, {
            items: [{ id: item.id, price_data: { currency: item.price.currency, product, unit_amount: Math.round(total * 100), recurring: { interval: "month" } } }],
            proration_behavior: "none",
            payment_behavior: "error_if_incomplete",
          }, { idempotencyKey: `reduce-${sub.id}-${token}` });
          providerUpdated = true;
        } catch (err) {
          console.error("[admin/subscriptions] Stripe repricing failed", err instanceof Error ? err.message : "unknown");
          return NextResponse.json({ error: "Provider result uncertain: reconcile before retrying", code: "RECONCILE_REQUIRED" }, { status: 503 });
        }
      }
      try {
        await prisma.$transaction(async (tx) => {
          const locked = await tx.subscription.updateMany({
            where: { id: sub.id, amount: sub.amount, status: sub.status, nextBillingDate: sub.nextBillingDate, chargeAttempts: 0, amountChangeLock: token },
            data: { amount: newAmount, amountUSD: usd, amountChangeLock: null, amountChangeStartedAt: null },
          });
          if (locked.count !== 1) throw new Error("PLAN_CHANGED_CONCURRENTLY");
          for (const allocation of allocations) {
            if (allocation.kind === "item") await tx.subscriptionItem.update({ where: { id: allocation.id }, data: { amount: allocation.amount, amountUSD: usd * allocation.amount / newAmount } });
            else await tx.subscriptionCategoryItem.update({ where: { id: allocation.id }, data: { amount: allocation.amount, amountUSD: usd * allocation.amount / newAmount } });
          }
          await tx.auditLog.create({
            data: {
              actorId: session!.user!.id ?? undefined, actorName: session!.user!.name ?? undefined,
              actorRole: session!.user!.role ?? "ADMIN", stream: "TEAM",
              action: "SUBSCRIPTION_AMOUNT_REDUCED", entityType: "Subscription", entityId: sub.id,
              messageAr: `تخفيض التبرع الدوري من ${sub.amount} إلى ${newAmount} ${sub.currency} بموافقة المتبرع`,
              messageEn: `Recurring plan reduced ${sub.amount} -> ${newAmount} ${sub.currency} with documented donor consent`,
              metadata: { oldAmount: sub.amount, newAmount, currency: sub.currency, rail, consentMethod: proofType, consentEvidence: evidence, nextBillingDate: sub.nextBillingDate?.toISOString() },
            },
          });
        });
      } catch (err) {
        if (!providerUpdated) await unlock().catch(() => undefined);
        console.error("[admin/subscriptions] post-provider reconciliation required", sub.id, err instanceof Error ? err.message : "unknown");
        return NextResponse.json({ error: "Update needs reconciliation with payment provider; do not retry before checking Stripe and the audit log", code: "RECONCILE_REQUIRED" }, { status: 503 });
      }
      return NextResponse.json({ ok: true, amount: newAmount, currency: sub.currency, nextBillingDate: sub.nextBillingDate, provider: { rail, confirmed: true } });
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
      // Resume at the plan's next own slot (the donor's chosen day and time,
      // in its zone). Stripe owns its plans' real cadence; this seeds the
      // mirror so list filters work until the next paid invoice.
      data.nextBillingDate = nextChargeForPlan(sub, new Date());
    }

    await prisma.subscription.update({
      where: { id },
      data,
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "SUBSCRIPTION_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} غيّر حالة الاشتراك من ${sub.status} إلى ${nextStatus} (${provider.rail === "STRIPE" ? `تأكيد Stripe: ${provider.providerStatus}${provider.providerPaused ? "، متوقف مؤقتًا" : ""}` : provider.rail === "ALBARAKA" ? "جدولة البركة داخلية" : provider.rail === "PAYPAL" ? "جدولة PayPal داخلية" : "لا يوجد اشتراك لدى مزوّد الدفع"})`,
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
