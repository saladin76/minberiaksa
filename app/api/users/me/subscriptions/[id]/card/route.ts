import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { albarakaConfig, albarakaRecurringConfig, isAlbarakaConfigured, isAlbarakaRecurringEnabled, isStoredCardExpired, isValidCardNumber, albarakaExpiryFromStored, albarakaOrderId, buildAlbaraka3DForm, albarakaMinorUnits, albarakaCurrencyCode, albarakaChargeCurrency } from "@/lib/albaraka";
import { decryptCard } from "@/lib/card-crypto";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { isValidLocale } from "@/lib/locales";
import { getUsdBaseRatesForServer, convertAmountInCurrencyToTry, convertAmountInCurrencyToUsd } from "@/lib/exchange/rates-service";
import { cardVerificationHash, cardVerificationToken, storedCardDigest } from "@/lib/donations/subscription-card-verification";
import { clientKey, hit } from "@/lib/ai/concierge/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params, verificationId = req.nextUrl.searchParams.get("verificationId") || "";
  if (!/^[a-f0-9]{24}$/i.test(id) || !/^[a-f0-9]{24}$/i.test(verificationId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const row = await prisma.subscriptionCardVerification.findFirst({ where: { id: verificationId, subscriptionId: id, donorId: session.user.id }, select: { status: true } });
    if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ verified: row.status === "COMPLETED" }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "CARD_VERIFICATION_UNAVAILABLE" }, { status: 503 }); }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params, body = await req.json().catch(() => null);
  if (!/^[a-f0-9]{24}$/i.test(id) || !body || !/^[a-f0-9]{24}$/i.test(body.cardId || "") || !/^\d{3,4}$/.test(body.cvc || "") || body.consent !== true) return NextResponse.json({ error: "INVALID_CARD_AUTHORIZATION" }, { status: 400 });
  const origin = paymentPublicOrigin(req.url);
  if (req.headers.get("origin") && req.headers.get("origin") !== origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const limit = hit(clientKey(req.headers, `subscription-card:${session.user.id}`), 5, 15 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "TOO_MANY_ATTEMPTS" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  try {
    const plan = await prisma.subscription.findFirst({ where: { id, donorId: session.user.id } });
    if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (plan.provider !== "ALBARAKA" || plan.status === "CANCELLED") return NextResponse.json({ error: "CARD_CHANGE_NOT_SUPPORTED" }, { status: 409 });
    if (plan.amountChangeLock || plan.billingLeaseUntil && plan.billingLeaseUntil > new Date()) return NextResponse.json({ error: "BILLING_IN_PROGRESS" }, { status: 409 });
    const paid = await prisma.donation.count({ where: { subscriptionId: id, donorId: session.user.id, status: "PAID", paidAt: { not: null } } });
    if (!paid) return NextResponse.json({ error: "FIRST_PAYMENT_REQUIRED" }, { status: 409 });
    const cfg = albarakaConfig();
    if (!isAlbarakaConfigured(cfg) || !isAlbarakaRecurringEnabled(albarakaRecurringConfig()) || !/^https:\/\//.test(cfg.tdsUrl)) return NextResponse.json({ error: "BANK_AUTHENTICATION_UNAVAILABLE" }, { status: 503 });
    const card = await prisma.creditCard.findFirst({ where: { id: body.cardId, userId: session.user.id } });
    if (!card || isStoredCardExpired(card.expiryDate)) return NextResponse.json({ error: "CARD_UNAVAILABLE" }, { status: 400 });
    const number = decryptCard(card.cardNumber);
    if (!isValidCardNumber(number)) return NextResponse.json({ error: "CARD_UNAVAILABLE" }, { status: 400 });
    const total = plan.amount + plan.teamSupport + (plan.coverFees ? (plan.amount + plan.teamSupport) * 0.03 : 0);
    const policy = albarakaChargeCurrency(), currency = plan.currency.toUpperCase();
    let amount = total, currencyCode = albarakaCurrencyCode(currency);
    if (policy === "USD" && !["USD", "US"].includes(currency)) { amount = convertAmountInCurrencyToUsd(total, currency, await getUsdBaseRatesForServer()); currencyCode = "US"; }
    else if (policy !== "USD" && !(policy === "DONOR" && ["TRY", "TL", "USD", "US", "EUR", "EU"].includes(currency))) { amount = convertAmountInCurrencyToTry(total, currency, await getUsdBaseRatesForServer()); currencyCode = "TL"; }
    const amountMinor = albarakaMinorUnits(amount);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return NextResponse.json({ error: "INVALID_AUTHORIZATION_AMOUNT" }, { status: 409 });
    const locale = isValidLocale(body.locale) ? body.locale : "en", token = cardVerificationToken(), orderId = albarakaOrderId();
    const row = await prisma.subscriptionCardVerification.create({ data: { subscriptionId: id, donorId: session.user.id, paymentCardId: card.id, oldPaymentCardId: plan.paymentCardId, cardDigest: storedCardDigest(card), orderId, tokenHash: cardVerificationHash(token), amount: plan.amount, currency: plan.currency, frequency: plan.frequency ?? "MONTHLY", teamSupport: plan.teamSupport, coverFees: plan.coverFees, amountMinor, currencyCode, merchantNo: cfg.merchantNo, terminalNo: cfg.terminalNo, nextBillingDate: plan.nextBillingDate,
      expiresAt: new Date(Date.now() + 15 * 60_000), consentSnapshot: { version: 1, scope: "FUTURE_CYCLES_SAME_PLAN", subscriptionId: id, amount: plan.amount, currency: plan.currency, frequency: plan.frequency ?? "MONTHLY", locale, confirmedAt: new Date().toISOString(), noImmediateCharge: true } } });
    const fields = buildAlbaraka3DForm({ orderId, amount: amountMinor, currencyCode, locale, returnUrl: `${origin}/api/albaraka/3d/callback?cardVerificationId=${row.id}&token=${encodeURIComponent(token)}&locale=${locale}`, card: { number, expireDate: albarakaExpiryFromStored(card.expiryDate), cvc2: body.cvc, holderName: card.cardholderName || "" } }, cfg);
    return NextResponse.json({ actionUrl: cfg.tdsUrl, fields, verificationOnly: true, paymentCaptures: 0 }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "CARD_VERIFICATION_UNAVAILABLE" }, { status: 503 }); }
}
