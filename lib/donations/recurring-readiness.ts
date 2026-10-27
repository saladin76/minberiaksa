type Plan = { hasPaidDonation?: boolean; status: string; provider?: string | null; lastBillingDate?: Date | null; nextBillingDate?: Date | null; paymentCardId?: string | null; paypalVaultId?: string | null; stripeSubscriptionId?: string | null; payforToken?: string | null; amountChangeLock?: string | null; billingLeaseUntil?: Date | null };
export type BillingReadiness = "inactive" | "awaiting_first_payment" | "authorization_missing" | "schedule_missing" | "reconciliation_required" | "processing" | "provider_managed" | "due" | "scheduled";
export function recurringReadiness(plan: Plan, now = new Date()): BillingReadiness {
  if (plan.status !== "ACTIVE") return "inactive";
  if (!plan.lastBillingDate || plan.hasPaidDonation === false) return "awaiting_first_payment";
  if (plan.amountChangeLock) return "reconciliation_required";
  if (plan.billingLeaseUntil && plan.billingLeaseUntil > now) return "processing";
  if (plan.provider === "ALBARAKA" ? !plan.paymentCardId : plan.provider === "PAYPAL" ? !plan.paypalVaultId : !(plan.stripeSubscriptionId || plan.payforToken)) return "authorization_missing";
  if (!["ALBARAKA", "PAYPAL"].includes(plan.provider || "")) return "provider_managed";
  if (!plan.nextBillingDate) return "schedule_missing";
  return plan.nextBillingDate <= now ? "due" : "scheduled";
}

export const BILLING_READINESS_LABELS: Record<BillingReadiness, string> = {
  inactive: "الاشتراك غير نشط", awaiting_first_payment: "بانتظار أول دفعة مؤكدة",
  authorization_missing: "تفويض الدفع غير مرتبط", schedule_missing: "موعد التجديد غير محدد",
  reconciliation_required: "تغيير المبلغ يحتاج مطابقة", processing: "دورة قيد المعالجة",
  provider_managed: "الفوترة لدى المزوّد", due: "مستحق للجدولة", scheduled: "مجدول للموعد القادم",
};
