import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { applyPlanStatusAtProvider, ProviderSyncError, planRail } from "@/lib/donations/subscription-provider-control";
import { nextChargeAt, normalizeTimezone, scheduleRuleFor, type RecurringFrequency } from "@/lib/donations/recurring-schedule";
import { convertAmountInCurrencyToUsd } from "@/lib/exchange/convert-amount-in-currency-to-usd";
import { writeAuditLog, auditActorFromSiteSession, auditStreamForRole } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/me/subscriptions/[id] — a donor changes their own plan.
 *
 * What can change, and where:
 *  - status: pause, resume, cancel — at the provider first (Stripe), then
 *    locally, through the same helper the dashboard uses. A cancelled plan
 *    cannot be reactivated; the donor starts a new one.
 *  - amount: on Stripe the subscription item is repriced (no proration) so
 *    the next invoice carries it; on Albaraka the scheduler reads the row.
 *  - frequency: only on Albaraka plans (the scheduler is ours). A Stripe
 *    plan is monthly by construction, so a cadence change there is refused
 *    with a reason the assistant can relay.
 */

const schema = z
  .object({
    status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
    amount: z.number().positive().max(1_000_000).optional(),
    frequency: z.enum(["DAILY", "FRIDAY", "MONTHLY"]).optional(),
  })
  .refine((v) => v.status || v.amount || v.frequency, { message: "Nothing to change" });

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { apiVersion: "2026-03-25.dahlia" }) : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  const input = parsed.data;

  const sub = await prisma.subscription.findFirst({
    where: { id, donorId: session.user.id },
    select: { id: true, status: true, amount: true, currency: true, frequency: true, timezone: true, provider: true, stripeSubscriptionId: true, payforToken: true, teamSupport: true },
  });
  if (!sub) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (sub.status === "CANCELLED") return NextResponse.json({ error: "A cancelled plan cannot be changed; start a new plan instead", code: "CANCELLED" }, { status: 409 });

  const rail = planRail(sub);
  const data: { status?: "ACTIVE" | "PAUSED" | "CANCELLED"; amount?: number; amountUSD?: number; frequency?: RecurringFrequency; scheduleRule?: unknown; nextBillingDate?: Date } = {};
  const changes: string[] = [];

  if (input.frequency && input.frequency !== sub.frequency) {
    if (rail === "STRIPE") {
      return NextResponse.json({ error: "This plan is billed monthly by the card gateway and its cadence cannot be changed; cancel it and start a new plan at the cadence you want", code: "CADENCE_LOCKED" }, { status: 409 });
    }
    const tz = normalizeTimezone(sub.timezone);
    const now = new Date();
    data.frequency = input.frequency;
    data.scheduleRule = scheduleRuleFor(input.frequency, now, tz);
    data.nextBillingDate = nextChargeAt(input.frequency, now, tz);
    changes.push(`frequency ${sub.frequency} → ${input.frequency}`);
  }

  if (input.amount && Math.abs(input.amount - sub.amount) > 0.004) {
    if (rail === "STRIPE") {
      const client = stripeClient();
      const stripeId = sub.stripeSubscriptionId ?? sub.payforToken;
      if (!client || !stripeId) return NextResponse.json({ error: "Card gateway unavailable" }, { status: 503 });
      try {
        const current = await client.subscriptions.retrieve(stripeId);
        const item = current.items.data[0];
        const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
        const fees = (input.amount + sub.teamSupport) * 0.03;
        const coverFees = (await prisma.subscription.findUnique({ where: { id: sub.id }, select: { coverFees: true } }))?.coverFees ?? false;
        const total = input.amount + sub.teamSupport + (coverFees ? fees : 0);
        await client.subscriptions.update(stripeId, {
          items: [{ id: item.id, price_data: { currency: item.price.currency, product, unit_amount: Math.round(total * 100), recurring: { interval: "month" } } }],
          proration_behavior: "none",
        });
      } catch (error) {
        console.error("[me/subscriptions] stripe reprice failed", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "The card gateway refused the change; please try again later or contact us", code: "PROVIDER" }, { status: 502 });
      }
    }
    data.amount = Math.round(input.amount * 100) / 100;
    try {
      data.amountUSD = await convertAmountInCurrencyToUsd(data.amount, sub.currency);
    } catch {
      /* USD mirror is analytics; the charge amount is what matters. */
    }
    changes.push(`amount ${sub.amount} → ${data.amount} ${sub.currency}`);
  }

  if (input.status && input.status !== sub.status) {
    try {
      await applyPlanStatusAtProvider(sub, input.status);
    } catch (err) {
      if (err instanceof ProviderSyncError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus });
      throw err;
    }
    data.status = input.status;
    if (input.status === "ACTIVE") data.nextBillingDate = nextChargeAt((data.frequency ?? sub.frequency) as RecurringFrequency, new Date(), normalizeTimezone(sub.timezone));
    changes.push(`status ${sub.status} → ${input.status}`);
  }

  if (!changes.length) return NextResponse.json({ ok: true, unchanged: true });

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { ...data, scheduleRule: data.scheduleRule as never },
    select: { id: true, status: true, amount: true, currency: true, frequency: true, nextBillingDate: true },
  });

  const actor = auditActorFromSiteSession(session);
  await writeAuditLog({
    ...actor,
    action: "SUBSCRIPTION_UPDATE",
    messageAr: `${actor.actorName ?? "متبرع"} عدّل خطته الدورية عبر مساعد العطاء: ${changes.join("، ")}`,
    messageEn: `${actor.actorName ?? "Donor"} changed their plan via the giving assistant: ${changes.join(", ")}`,
    entityType: "Subscription",
    entityId: sub.id,
    metadata: { changes, rail },
    stream: auditStreamForRole(actor.actorRole),
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, plan: { ...updated, nextBillingDate: updated.nextBillingDate?.toISOString().slice(0, 10) ?? null } });
}
