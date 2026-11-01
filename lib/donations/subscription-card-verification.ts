import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { albarakaResponseMac, isStoredCardExpired } from "@/lib/albaraka";
import { albaraka3DLinkageError } from "./albaraka-3d-verification";
import { subscriptionFrequencyWhere } from "../dashboard/recurring-frequency-filter";
import { billingLeaseAvailable } from "./recurring-lease";

export const cardVerificationHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const storedCardDigest = (card: { id: string; cardNumber: string; expiryDate: string }) => cardVerificationHash(`${card.id}:${card.cardNumber}:${card.expiryDate}`);
export const cardVerificationToken = () => randomBytes(32).toString("base64url");
function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** No Sale/capture is called here: bank authentication only changes a future card. */
export async function completeSubscriptionCardVerification(db: PrismaClient, id: string, token: string, raw: Record<string, string>, cfg: { merchantNo: string; terminalNo: string; encKey: string }, now = new Date()) {
  const row = await db.subscriptionCardVerification.findUnique({ where: { id } });
  if (!row || !equal(cardVerificationHash(token), row.tokenHash)) return { ok: false as const, reason: "INVALID_VERIFICATION", subscriptionId: null };
  const result = (ok: boolean, reason: string) => ({ ok, reason, subscriptionId: row.subscriptionId });
  if (!raw.MacNew || !equal(raw.MacNew, albarakaResponseMac(raw, cfg.encKey))) return result(false, "INVALID_BANK_SIGNATURE");
  const linkage = albaraka3DLinkageError(raw, { orderId: row.orderId, amount: row.amountMinor, currencyCode: row.currencyCode, transactionType: "Sale", mode: "3D" }, row.orderId, row.merchantNo);
  if (linkage || row.merchantNo !== cfg.merchantNo || row.terminalNo !== cfg.terminalNo) return result(false, "BANK_RESULT_MISMATCH");
  if (raw.MdStatus !== "1" || !raw.SecureTransactionId?.trim() || !raw.CAVV?.trim() || !raw.ECI?.trim() || !raw.MD?.trim()) return result(false, "BANK_AUTHENTICATION_FAILED");
  if (row.status === "COMPLETED") return result(true, "ALREADY_COMPLETED");
  if (row.status !== "PENDING" || row.expiresAt <= now) return result(false, "VERIFICATION_EXPIRED");
  try {
    await db.$transaction(async tx => {
      const card = await tx.creditCard.findFirst({ where: { id: row.paymentCardId, userId: row.donorId } });
      if (!card || isStoredCardExpired(card.expiryDate, now) || storedCardDigest(card) !== row.cardDigest) throw new Error("CARD_CHANGED");
      const claimed = await tx.subscriptionCardVerification.updateMany({ where: { id, status: "PENDING", expiresAt: { gt: now } }, data: { status: "COMPLETED", completedAt: now } });
      if (claimed.count !== 1) throw new Error("VERIFICATION_ALREADY_USED");
      const changed = await tx.subscription.updateMany({
        where: { id: row.subscriptionId, donorId: row.donorId, provider: "ALBARAKA", status: { not: "CANCELLED" },
          ...(row.oldPaymentCardId ? { paymentCardId: row.oldPaymentCardId } : {}), amount: row.amount, currency: row.currency,
          ...subscriptionFrequencyWhere(row.frequency), teamSupport: row.teamSupport, coverFees: row.coverFees,
          ...(row.nextBillingDate ? { nextBillingDate: row.nextBillingDate } : {}),
          AND: [billingLeaseAvailable(now), { OR: [{ amountChangeLock: null }, { amountChangeLock: { isSet: false } }] },
            ...(!row.oldPaymentCardId ? [{ OR: [{ paymentCardId: null }, { paymentCardId: { isSet: false as const } }] }] : []),
            ...(!row.nextBillingDate ? [{ OR: [{ nextBillingDate: null }, { nextBillingDate: { isSet: false as const } }] }] : [])] },
        data: { paymentCardId: row.paymentCardId },
      });
      if (changed.count !== 1) throw new Error("PLAN_CHANGED_OR_BILLING_IN_PROGRESS");
      await tx.auditLog.create({ data: { actorId: row.donorId, actorRole: "DONOR", stream: "DONOR", action: "SUBSCRIPTION_CARD_VERIFIED", entityType: "Subscription", entityId: row.subscriptionId,
        messageAr: "تحقق المتبرع بنكيًا من بطاقة بديلة للتبرع الدوري؛ تسري على الدورات القادمة دون خصم الآن",
        metadata: { verificationId: row.id, oldCardId: row.oldPaymentCardId, newCardId: row.paymentCardId, method: "ALBARAKA_3DS_AUTHENTICATION_ONLY", amountUnchanged: true, scheduleUnchanged: true, captures: 0, consent: row.consentSnapshot } as Prisma.InputJsonValue } });
    });
    return result(true, "COMPLETED");
  } catch {
    // The old card and schedule survive a stale plan, a racing cron or audit failure.
    return result(false, "PLAN_CHANGED_OR_VERIFICATION_UNAVAILABLE");
  }
}
