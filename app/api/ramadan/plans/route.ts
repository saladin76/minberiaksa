import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { albarakaConfig, albarakaRecurringConfig, isAlbarakaConfigured, isAlbarakaRecurringEnabled, isStoredCardExpired, isValidCardNumber, albarakaExpiryFromStored, albarakaOrderId, buildAlbaraka3DForm, albarakaMinorUnits, albarakaCurrencyCode, albarakaChargeCurrency } from "@/lib/albaraka";
import { decryptCard } from "@/lib/card-crypto";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { isValidLocale } from "@/lib/locales";
import { getUsdBaseRatesForServer, convertAmountInCurrencyToTry } from "@/lib/exchange/rates-service";
import { cardVerificationHash, cardVerificationToken, storedCardDigest } from "@/lib/donations/subscription-card-verification";
import { clientKey, hit } from "@/lib/ai/concierge/rate-limit";
import { normalizeTimezone } from "@/lib/donations/recurring-schedule";
import { readRamadanSettings } from "@/lib/minbar/ramadan-settings-service";
import { buildRamadanPlan, type RamadanPlanInput } from "@/lib/donations/ramadan-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private" };

/**
 * Creates a Ramadan plan and opens the bank's 3D authentication for its card — no Sale, no
 * capture (the same authentication-only path as a card change, completed by the existing
 * /api/albaraka/3d/callback). The plan carries no card until that succeeds, and the scheduler
 * never charges a Ramadan plan without one. Before the service is switched on, only dashboard
 * admins can create plans (staff testing).
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
    const { settings } = await readRamadanSettings();
    const admin = (session.user as { role?: string }).role === "ADMIN";
    if (!settings.enabled && !admin) return NextResponse.json({ error: "RAMADAN_SCHEDULING_CLOSED" }, { status: 403, headers: noStore });
    const timezone = normalizeTimezone(body.timezone);
    const input: RamadanPlanInput = { days: body.days, slot: body.slot, timezone, lat: body.lat, lng: body.lng, projectIds: body.projectIds, intent: body.intent, onBehalf: body.onBehalf, remind: body.remind === true };
    const plan = buildRamadanPlan(input, settings, new Date());
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400, headers: noStore });
    const live = await prisma.campaign.count({ where: { id: { in: plan.rule.projectIds }, isActive: true } });
    if (live !== plan.rule.projectIds.length) return NextResponse.json({ error: "PROJECT_NOT_OFFERED" }, { status: 409, headers: noStore });
    const cfg = albarakaConfig();
    if (!isAlbarakaConfigured(cfg) || !isAlbarakaRecurringEnabled(albarakaRecurringConfig()) || !/^https:\/\//.test(cfg.tdsUrl)) return NextResponse.json({ error: "BANK_AUTHENTICATION_UNAVAILABLE" }, { status: 503, headers: noStore });
    const card = await prisma.creditCard.findFirst({ where: { id: body.cardId, userId: session.user.id } });
    if (!card || isStoredCardExpired(card.expiryDate)) return NextResponse.json({ error: "CARD_UNAVAILABLE" }, { status: 400, headers: noStore });
    const number = decryptCard(card.cardNumber);
    if (!isValidCardNumber(number)) return NextResponse.json({ error: "CARD_UNAVAILABLE" }, { status: 400, headers: noStore });

    // The bank page shows the first day's amount; nothing is captured.
    const policy = albarakaChargeCurrency();
    let amount = plan.first.amount, currencyCode = albarakaCurrencyCode("USD");
    if (policy !== "USD" && policy !== "DONOR") { amount = convertAmountInCurrencyToTry(plan.first.amount, "USD", await getUsdBaseRatesForServer()); currencyCode = "TL"; }
    const amountMinor = albarakaMinorUnits(amount);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return NextResponse.json({ error: "INVALID_AUTHORIZATION_AMOUNT" }, { status: 409, headers: noStore });
    const locale = isValidLocale(body.locale) ? body.locale : "ar", token = cardVerificationToken(), orderId = albarakaOrderId(), now = new Date();
    const consent = { version: 1, scope: "RAMADAN_SCHEDULE", hijriYear: plan.rule.hijriYear, days: plan.rule.days, slot: plan.rule.slot, timezone, total: plan.total, currency: "USD", projectIds: plan.rule.projectIds, intent: plan.rule.intent, onBehalf: plan.rule.onBehalf, locale, confirmedAt: now.toISOString(), noImmediateCharge: true };

    const created = await prisma.$transaction(async (tx) => {
      // An earlier Ramadan plan this donor never finished verifying is replaced, not left behind.
      await tx.subscription.updateMany({ where: { donorId: session.user.id, frequency: "RAMADAN", status: "ACTIVE", OR: [{ paymentCardId: null }, { paymentCardId: { isSet: false } }] }, data: { status: "CANCELLED" } });
      const sub = await tx.subscription.create({ data: {
        status: "ACTIVE", amount: plan.first.amount, amountUSD: plan.first.amount, currency: "USD", teamSupport: 0, coverFees: false,
        paymentMethod: "CARD", donorId: session.user.id, frequency: "RAMADAN", timezone, provider: "ALBARAKA",
        scheduleRule: plan.rule as unknown as Prisma.InputJsonValue, consentSnapshot: consent as unknown as Prisma.InputJsonValue,
        nextBillingDate: plan.first.at, lastBillingDate: null,
        items: { create: plan.firstItems.map((i) => ({ campaignId: i.campaignId, amount: i.amount, amountUSD: i.amount })) },
      } });
      const row = await tx.subscriptionCardVerification.create({ data: {
        subscriptionId: sub.id, donorId: session.user.id, paymentCardId: card.id, oldPaymentCardId: null, cardDigest: storedCardDigest(card), orderId, tokenHash: cardVerificationHash(token),
        amount: plan.first.amount, currency: "USD", frequency: "RAMADAN", teamSupport: 0, coverFees: false, amountMinor, currencyCode, merchantNo: cfg.merchantNo, terminalNo: cfg.terminalNo,
        nextBillingDate: plan.first.at, expiresAt: new Date(now.getTime() + 15 * 60_000), consentSnapshot: consent as unknown as Prisma.InputJsonValue,
      } });
      await tx.auditLog.create({ data: { actorId: session.user.id, actorRole: admin ? "ADMIN" : "DONOR", stream: "DONOR", action: "RAMADAN_PLAN_CREATED", entityType: "Subscription", entityId: sub.id,
        messageAr: `أنشأ المتبرع جدولة رمضان: ${plan.rule.days.length} يومًا بإجمالي ${plan.total} دولار؛ بانتظار تحقق البطاقة دون خصم`,
        metadata: { days: plan.rule.days.length, total: plan.total, slot: plan.rule.slot, projects: plan.rule.projectIds.length, verificationId: row.id, beforeLaunch: !settings.enabled } as Prisma.InputJsonValue } });
      return { sub, row };
    });
    const fields = buildAlbaraka3DForm({ orderId, amount: amountMinor, currencyCode, locale, returnUrl: `${origin}/api/albaraka/3d/callback?cardVerificationId=${created.row.id}&token=${encodeURIComponent(token)}&locale=${locale}`,
      card: { number, expireDate: albarakaExpiryFromStored(card.expiryDate), cvc2: body.cvc, holderName: card.cardholderName || "" } }, cfg);
    return NextResponse.json({ actionUrl: cfg.tdsUrl, fields, planId: created.sub.id, verificationId: created.row.id, verificationOnly: true, paymentCaptures: 0, firstCharge: plan.first.at.toISOString(), total: plan.total }, { headers: noStore });
  } catch { return NextResponse.json({ error: "RAMADAN_PLAN_UNAVAILABLE" }, { status: 503, headers: noStore }); }
}
