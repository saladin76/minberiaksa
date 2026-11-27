import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { albarakaConfig, albarakaRecurringConfig, isAlbarakaConfigured, isAlbarakaRecurringEnabled, isStoredCardExpired } from "@/lib/albaraka";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { isValidLocale } from "@/lib/locales";
import { mintDonationAccessToken } from "@/lib/donations/access-token";
import { clientKey, hit } from "@/lib/ai/concierge/rate-limit";
import { normalizeTimezone } from "@/lib/donations/recurring-schedule";
import { readRamadanSettings } from "@/lib/minbar/ramadan-settings-service";
import { buildRamadanPlan, type RamadanPlanInput } from "@/lib/donations/ramadan-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private" };
/** The card proof at signup, counted as a donation (owner, 2026-11-27). */
const RAMADAN_VERIFICATION_USD = 1;

/**
 * Creates a Ramadan plan and its first instalment: a 1 USD donation to the same projects, which
 * the page pays through /api/albaraka/3d/initiate (3D + Sale, the path a Friday plan's first
 * instalment uses). Settlement makes the plan live and keeps its first Ramadan day; the scheduler
 * charges only plans with that settled payment. Before the service is switched on, only
 * dashboard admins can create plans (staff testing).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const origin = paymentPublicOrigin(req.url);
  if (req.headers.get("origin") && req.headers.get("origin") !== origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers: noStore });
  const limit = hit(clientKey(req.headers, `ramadan-plan:${session.user.id}`), 5, 15 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "TOO_MANY_ATTEMPTS" }, { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfterSeconds) } });
  const body = await req.json().catch(() => null);
  if (!body || !/^[a-f0-9]{24}$/i.test(body.cardId || "") || !/^\d{3,4}$/.test(body.cvc || "") || body.consent !== true) return NextResponse.json({ error: "INVALID_CARD_AUTHORIZATION" }, { status: 400, headers: noStore });
  try {
    // Schedules whose 1 USD first payment was never completed are closed after an hour.
    await prisma.subscription.updateMany({ where: { frequency: "RAMADAN", status: "ACTIVE", createdAt: { lt: new Date(Date.now() - 3_600_000) }, lastBillingDate: null }, data: { status: "CANCELLED" } }).catch(() => {});
    const { settings } = await readRamadanSettings();
    const admin = (session.user as { role?: string }).role === "ADMIN";
    if (!settings.enabled && !admin) return NextResponse.json({ error: "RAMADAN_SCHEDULING_CLOSED" }, { status: 403, headers: noStore });
    const timezone = normalizeTimezone(body.timezone);
    const input: RamadanPlanInput = { days: body.days, slot: body.slot, timezone, lat: body.lat, lng: body.lng, projectIds: body.projectIds, intent: body.intent, onBehalf: body.onBehalf, remind: body.remind === true };
    const plan = buildRamadanPlan(input, settings, new Date());
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400, headers: noStore });
    const live = await prisma.campaign.count({ where: { id: { in: plan.rule.projectIds }, isActive: true } });
    if (live !== plan.rule.projectIds.length) return NextResponse.json({ error: "PROJECT_NOT_OFFERED" }, { status: 409, headers: noStore });
    if (!isAlbarakaConfigured(albarakaConfig()) || !isAlbarakaRecurringEnabled(albarakaRecurringConfig())) return NextResponse.json({ error: "BANK_AUTHENTICATION_UNAVAILABLE" }, { status: 503, headers: noStore });
    const card = await prisma.creditCard.findFirst({ where: { id: body.cardId, userId: session.user.id }, select: { id: true, expiryDate: true } });
    if (!card || isStoredCardExpired(card.expiryDate)) return NextResponse.json({ error: "CARD_UNAVAILABLE" }, { status: 400, headers: noStore });

    /* Owner decision (2026-11-27): the card is proven by a real 1 USD 3D payment now, counted as a
       donation to the same projects, exactly as a Friday plan proves its card with its first
       instalment. The plan then charges its chosen Ramadan days automatically. */
    const locale = isValidLocale(body.locale) ? body.locale : "ar", now = new Date();
    const ids = plan.rule.projectIds, cents = 100, share = Math.floor(cents / ids.length);
    const dollarLines = ids.map((campaignId, i) => ({ campaignId, amount: (i === ids.length - 1 ? cents - share * (ids.length - 1) : share) / 100 }));
    const consent = { version: 2, scope: "RAMADAN_SCHEDULE", hijriYear: plan.rule.hijriYear, days: plan.rule.days, slot: plan.rule.slot, timezone, total: plan.total, currency: "USD", projectIds: ids, intent: plan.rule.intent, onBehalf: plan.rule.onBehalf, locale, confirmedAt: now.toISOString(), verificationCharge: { amount: RAMADAN_VERIFICATION_USD, currency: "USD", countedAsDonation: true } };

    const created = await prisma.$transaction(async (tx) => {
      // An earlier Ramadan plan this donor never finished paying is replaced, not left behind.
      await tx.subscription.updateMany({ where: { donorId: session.user.id, frequency: "RAMADAN", status: "ACTIVE", lastBillingDate: null }, data: { status: "CANCELLED" } });
      const sub = await tx.subscription.create({ data: {
        status: "ACTIVE", amount: plan.first.amount, amountUSD: plan.first.amount, currency: "USD", teamSupport: 0, coverFees: false,
        paymentMethod: "CARD", donorId: session.user.id, frequency: "RAMADAN", timezone, provider: "ALBARAKA",
        scheduleRule: plan.rule as unknown as Prisma.InputJsonValue, consentSnapshot: consent as unknown as Prisma.InputJsonValue,
        nextBillingDate: plan.first.at, lastBillingDate: null,
        items: { create: plan.firstItems.map((i) => ({ campaignId: i.campaignId, amount: i.amount, amountUSD: i.amount })) },
      } });
      // The first instalment of the plan: 1 USD, paid through the ordinary Albaraka checkout path.
      const donation = await tx.donation.create({ data: {
        accessToken: mintDonationAccessToken(), amount: RAMADAN_VERIFICATION_USD, amountUSD: RAMADAN_VERIFICATION_USD, teamSupport: 0, coverFees: false, currency: "USD", fees: 0,
        totalAmount: RAMADAN_VERIFICATION_USD, status: "PAID", locale, donorId: session.user.id, subscriptionId: sub.id, paymentMethod: "CARD", provider: "ALBARAKA",
        providerRaw: { paymentRouting: { version: 1, gateway: "ALBARAKA" }, ramadanVerification: true } as Prisma.InputJsonValue, cardDetails: null,
        items: { create: dollarLines.map((l) => ({ campaignId: l.campaignId, amount: l.amount, amountUSD: l.amount })) },
      } });
      await tx.auditLog.create({ data: { actorId: session.user.id, actorRole: admin ? "ADMIN" : "DONOR", stream: "DONOR", action: "RAMADAN_PLAN_CREATED", entityType: "Subscription", entityId: sub.id,
        messageAr: `أنشأ المتبرع جدولة رمضان: ${plan.rule.days.length} يومًا بإجمالي ${plan.total} دولار؛ بانتظار دفعة التحقق (1 دولار)`,
        metadata: { days: plan.rule.days.length, total: plan.total, slot: plan.rule.slot, projects: ids.length, verificationDonationId: donation.id, beforeLaunch: !settings.enabled } as Prisma.InputJsonValue } });
      return { sub, donation };
    });
    return NextResponse.json({ planId: created.sub.id, donationId: created.donation.id, accessToken: created.donation.accessToken, verificationCharge: RAMADAN_VERIFICATION_USD, firstCharge: plan.first.at.toISOString(), total: plan.total }, { headers: noStore });
  } catch { return NextResponse.json({ error: "RAMADAN_PLAN_UNAVAILABLE" }, { status: 503, headers: noStore }); }
}
