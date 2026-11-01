import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "../prisma";
import { albarakaMinorUnits, albarakaRecurringConfig, albarakaRecurringOrderId, isAlbarakaRecurringEnabled } from "../albaraka";
import { billingLeaseAvailable } from "./recurring-lease";
import { chargeAlbarakaRehearsalCycle } from "./albaraka-recurring";
import { bankDonationSelect } from "./bank-operations-service";
import { callBankOperation } from "./bank-operations-provider";
import { inspectBankReply } from "./bank-operations-inspection";
import type { Prisma } from "@prisma/client";

type Options = { subscriptionId: string; donorId: string; currency: string; maxTotal: string; cycles?: number; intervalSeconds?: number; runId?: string; execute?: boolean };
type Spec = { subscriptionId: string; donorId: string; currency: string; frequency: string; maxTotalMinor: number; amountMinor: number; cardId: string; cycles: number; intervalSeconds: number; originalNextDate: string; createdAt: string };
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const tokenFor = (runId: string) => `RECURRING_TEST:${runId}`;
const phaseWhere = (runId: string) => ({ entityType: "RecurringRehearsal", entityId: runId });

export class RecurringRehearsalEligibilityError extends Error {
  constructor(readonly reasons: string[]) {
    super("ONLY_NEW_SETTLED_ADMIN_TEST_PLAN_ALLOWED");
    this.name = "RecurringRehearsalEligibilityError";
  }
}

export async function runRecurringRehearsal(options: Options, wait: (ms: number) => Promise<void> = pause) {
  const cycles = options.cycles ?? 3, intervalSeconds = options.intervalSeconds ?? 60;
  const runId = options.runId ?? randomBytes(12).toString("hex");
  if (![options.subscriptionId, options.donorId, runId].every(value => /^[a-f0-9]{24}$/.test(value)) ||
    !/^[A-Z]{3}$/.test(options.currency) || !/^\d+(?:\.\d{1,2})?$/.test(options.maxTotal) ||
    !Number.isInteger(cycles) || cycles < 1 || cycles > 3 || !Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 600) throw new Error("INVALID_REHEARSAL_OPTIONS");
  const maxTotalMinor = albarakaMinorUnits(Number(options.maxTotal));
  if (!Number.isSafeInteger(maxTotalMinor) || maxTotalMinor <= 0 || !isAlbarakaRecurringEnabled()) throw new Error("REHEARSAL_NOT_READY");
  const anchor = await prisma.auditLog.findUnique({ where: { id: runId } });
  if (anchor && (anchor.action !== "RECURRING_REHEARSAL_STARTED" || anchor.entityId !== options.subscriptionId || anchor.actorId !== options.donorId)) throw new Error("RUN_ID_CONFLICT");
  const saved = anchor ? object(anchor.metadata) as unknown as Spec : null;
  if (saved && (saved.subscriptionId !== options.subscriptionId || saved.donorId !== options.donorId || saved.currency !== options.currency || saved.cycles !== cycles || saved.intervalSeconds !== intervalSeconds || saved.maxTotalMinor !== maxTotalMinor)) throw new Error("RUN_ID_CONFLICT");
  const finished = anchor && await prisma.auditLog.findFirst({ where: { ...phaseWhere(runId), action: { in: ["RECURRING_REHEARSAL_COMPLETED", "RECURRING_REHEARSAL_STOPPED"] } } });
  if (finished) return { runId, state: finished.action.endsWith("COMPLETED") ? "COMPLETED" : "STOPPED", replayed: true, newCharges: 0 };
  // MongoDB/Prisma negation omits null and missing fields. First Albaraka
  // checkout payments have no billingReason; include both forms explicitly.
  const plan = await prisma.subscription.findFirst({ where: { id: options.subscriptionId, donorId: options.donorId }, include: { donor: { select: { role: true } }, donations: { where: { status: "PAID", paidAt: { not: null }, OR: [{ billingReason: { not: "subscription_test_cycle" } }, { billingReason: null }, { billingReason: { isSet: false } }] }, take: 1, select: { id: true } } } });
  const now = new Date();
  if (!plan) throw new RecurringRehearsalEligibilityError(["PLAN_NOT_FOUND_OR_OWNER_MISMATCH"]);
  const reasons: string[] = [];
  if (plan.donor.role !== "ADMIN") reasons.push("ADMIN_OWNER_REQUIRED");
  if (plan.provider !== "ALBARAKA") reasons.push("ALBARAKA_PLAN_REQUIRED");
  if (plan.status !== "ACTIVE") reasons.push("ACTIVE_PLAN_REQUIRED");
  if (!["DAILY", "FRIDAY", "MONTHLY"].includes(plan.frequency ?? "MONTHLY")) reasons.push("UNSUPPORTED_FREQUENCY");
  if (!plan.paymentCardId) reasons.push("SAVED_PAYMENT_CARD_REQUIRED");
  if (!plan.lastBillingDate) reasons.push("SETTLED_BILLING_DATE_REQUIRED");
  if (!plan.donations.length) reasons.push("SETTLED_NON_TEST_PAYMENT_REQUIRED");
  if (now.getTime() - plan.createdAt.getTime() > 86400000) reasons.push("PLAN_OLDER_THAN_24_HOURS");
  if (plan.createdAt > now) reasons.push("PLAN_CREATED_IN_FUTURE");
  if (plan.currency !== options.currency) reasons.push("CURRENCY_MISMATCH");
  if (!plan.nextBillingDate) reasons.push("NEXT_BILLING_DATE_REQUIRED");
  if (!saved) {
    if (plan.chargeAttempts !== 0) reasons.push("PREVIOUS_CHARGE_ATTEMPTS_PRESENT");
    if (plan.amountChangeLock) reasons.push("AMOUNT_CHANGE_LOCK_PRESENT");
    if (plan.nextBillingDate && plan.nextBillingDate.getTime() <= now.getTime() + (cycles * intervalSeconds + 900) * 1000) reasons.push("NORMAL_BILLING_TOO_CLOSE");
  }
  // Keep the required snapshot fields narrowed after collecting every failure.
  if (reasons.length || !plan.nextBillingDate || !plan.paymentCardId) throw new RecurringRehearsalEligibilityError(reasons);
  const amountMinor = albarakaMinorUnits(plan.amount + plan.teamSupport + (plan.coverFees ? (plan.amount + plan.teamSupport) * .03 : 0));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor * cycles > maxTotalMinor) throw new Error("REHEARSAL_BUDGET_EXCEEDED");
  if (saved && (saved.frequency !== (plan.frequency ?? "MONTHLY") || saved.amountMinor !== amountMinor || saved.cardId !== plan.paymentCardId || saved.originalNextDate !== plan.nextBillingDate.toISOString() || plan.amountChangeLock !== tokenFor(runId))) throw new Error("REHEARSAL_PLAN_CHANGED");
  const spec: Spec = saved ?? { subscriptionId: plan.id, donorId: plan.donorId, currency: plan.currency, frequency: plan.frequency ?? "MONTHLY", amountMinor, maxTotalMinor, cardId: plan.paymentCardId, cycles, intervalSeconds, originalNextDate: plan.nextBillingDate.toISOString(), createdAt: now.toISOString() };
  const preview = { runId, subscriptionId: plan.id, currency: plan.currency, frequency: plan.frequency ?? "MONTHLY", cycles, intervalSeconds, perCycle: amountMinor / 100, maximumAdditionalCharge: amountMinor * cycles / 100, originalNextDate: spec.originalNextDate, mailOrder: albarakaRecurringConfig().mailOrder === true };
  if (!options.execute) return { ...preview, state: "PREVIEW", readOnly: true, newCharges: 0 };
  if (!options.runId) throw new Error("PREVIEW_RUN_ID_REQUIRED");
  if (!anchor) await prisma.$transaction(async tx => {
    const claim = await tx.subscription.updateMany({ where: { id: plan.id, donorId: plan.donorId, status: "ACTIVE", provider: "ALBARAKA", amount: plan.amount, currency: plan.currency, teamSupport: plan.teamSupport, coverFees: plan.coverFees, paymentCardId: plan.paymentCardId, chargeAttempts: 0, nextBillingDate: plan.nextBillingDate, AND: [billingLeaseAvailable(now), { OR: [{ amountChangeLock: null }, { amountChangeLock: { isSet: false } }] }] }, data: { amountChangeLock: tokenFor(runId), amountChangeStartedAt: now } });
    if (claim.count !== 1) throw new Error("REHEARSAL_PLAN_BUSY");
    await tx.auditLog.create({ data: { id: runId, actorId: plan.donorId, actorRole: "ADMIN", stream: "TEAM", action: "RECURRING_REHEARSAL_STARTED", entityType: "Subscription", entityId: plan.id, messageAr: "بدء اختبار تجديد متتابع لاشتراك المدير التجريبي بسقف مالي محدد", metadata: spec as unknown as Prisma.InputJsonValue } });
  });
  let newCharges = 0;
  const confirmed: Array<{ cycle: number; donationId: string; bankCode: string }> = [];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const fresh = await prisma.subscription.findUnique({ where: { id: plan.id } });
    if (!fresh || fresh.amountChangeLock !== tokenFor(runId) || fresh.currency !== spec.currency || (fresh.frequency ?? "MONTHLY") !== spec.frequency || fresh.paymentCardId !== spec.cardId || fresh.nextBillingDate?.toISOString() !== spec.originalNextDate || albarakaMinorUnits(fresh.amount + fresh.teamSupport + (fresh.coverFees ? (fresh.amount + fresh.teamSupport) * .03 : 0)) !== spec.amountMinor) throw new Error("REHEARSAL_PLAN_CHANGED_OR_PENDING_REVIEW");
    const orderId = albarakaRecurringOrderId(plan.id, `REHEARSAL:${runId}`, cycle);
    let donation = await prisma.donation.findFirst({ where: { subscriptionId: plan.id, providerOrderId: orderId }, select: { ...bankDonationSelect, providerTxnResult: true, providerProcReturnCode: true } });
    if (!donation && fresh.status === "ACTIVE") {
      const outcome = await chargeAlbarakaRehearsalCycle(plan.id, plan.donorId, { runId, cycle }, spec);
      if (outcome.result === "charged") newCharges++;
      donation = await prisma.donation.findFirst({ where: { subscriptionId: plan.id, providerOrderId: orderId }, select: { ...bankDonationSelect, providerTxnResult: true, providerProcReturnCode: true } });
      if (!donation && outcome.result === "already_attempted") throw new Error("REHEARSAL_PLAN_BUSY");
    }
    if (!donation?.paidAt || donation.status !== "PAID") {
      const definite = donation?.status === "FAILED" && donation.providerTxnResult === "Failed";
      if (definite) await prisma.$transaction(async tx => {
        const changed = await tx.subscription.updateMany({ where: { id: plan.id, amountChangeLock: tokenFor(runId), AND: [billingLeaseAvailable(new Date())] }, data: { status: "PAYMENT_FAILED", nextBillingDate: new Date(spec.originalNextDate), amountChangeLock: null, amountChangeStartedAt: null } });
        if (changed.count !== 1) throw new Error("REHEARSAL_PLAN_BUSY");
        await tx.auditLog.create({ data: { ...phaseWhere(runId), actorId: plan.donorId, actorRole: "ADMIN", stream: "TEAM", action: "RECURRING_REHEARSAL_STOPPED", messageAr: "توقف اختبار التجديد عند أول إخفاق دون إعادة خصم تلقائية", metadata: { cycle, donationId: donation?.id ?? null } } });
      });
      return { ...preview, state: definite ? "STOPPED" : "REVIEW_REQUIRED", newCharges, confirmed, stoppedAtCycle: cycle, code: donation?.providerProcReturnCode ?? null, lockRetained: !definite };
    }
    let verified = false, bankCode = "";
    for (let query = 0; query < 3; query++) {
      try { const reply = await callBankOperation(donation, "INQUIRE", `TEST${runId}${cycle}`); bankCode = reply.code; verified = inspectBankReply(donation, reply).verified; } catch { bankCode = "UNKNOWN"; }
      if (verified) break;
      if (query < 2) await wait(2000);
    }
    if (!verified) return { ...preview, state: "REVIEW_REQUIRED", newCharges, confirmed, stoppedAtCycle: cycle, bankCode, lockRetained: true };
    confirmed.push({ cycle, donationId: donation.id, bankCode });
    if (cycle < cycles) await wait(intervalSeconds * 1000);
  }
  await prisma.$transaction(async tx => {
    const released = await tx.subscription.updateMany({ where: { id: plan.id, status: "ACTIVE", amountChangeLock: tokenFor(runId), nextBillingDate: new Date(spec.originalNextDate), AND: [billingLeaseAvailable(new Date())] }, data: { status: "PAUSED", amountChangeLock: null, amountChangeStartedAt: null } });
    if (released.count !== 1) throw new Error("REHEARSAL_PLAN_BUSY");
    await tx.auditLog.create({ data: { ...phaseWhere(runId), actorId: plan.donorId, actorRole: "ADMIN", stream: "TEAM", action: "RECURRING_REHEARSAL_COMPLETED", messageAr: "اكتمل اختبار التجديد وأكد البنك كل دورة وأوقف الاشتراك التجريبي مؤقتًا", metadata: { confirmed } } });
  });
  return { ...preview, state: "COMPLETED", newCharges, confirmed, lockRetained: false, subscriptionStatus: "PAUSED" };
}
