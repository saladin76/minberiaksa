export type RecurringPlanReadinessInput = { hasPaidDonation?: boolean; status: string; provider?: string | null; lastBillingDate?: Date | null; nextBillingDate?: Date | null; paymentCardId?: string | null; paypalVaultId?: string | null; stripeSubscriptionId?: string | null; payforToken?: string | null; amountChangeLock?: string | null; billingLeaseUntil?: Date | null };
export type BillingReadiness = "inactive" | "awaiting_first_payment" | "billing_history_missing" | "authorization_missing" | "schedule_missing" | "schedule_invalid" | "reconciliation_required" | "processing" | "provider_managed" | "due" | "scheduled";
export function recurringReadiness(plan: RecurringPlanReadinessInput, now = new Date()): BillingReadiness {
  if (plan.status !== "ACTIVE") return "inactive";
  if (plan.hasPaidDonation === false) return "awaiting_first_payment";
  if (!plan.lastBillingDate || !Number.isFinite(plan.lastBillingDate.getTime())) return plan.hasPaidDonation ? "billing_history_missing" : "awaiting_first_payment";
  if (plan.amountChangeLock) return "reconciliation_required";
  if (plan.billingLeaseUntil && plan.billingLeaseUntil > now) return "processing";
  if (plan.provider === "ALBARAKA" ? !plan.paymentCardId : plan.provider === "PAYPAL" ? !plan.paypalVaultId : !(plan.stripeSubscriptionId || plan.payforToken)) return "authorization_missing";
  if (!["ALBARAKA", "PAYPAL"].includes(plan.provider || "")) return "provider_managed";
  if (!plan.nextBillingDate) return "schedule_missing";
  if (!Number.isFinite(plan.nextBillingDate.getTime()) || plan.nextBillingDate <= plan.lastBillingDate) return "schedule_invalid";
  return plan.nextBillingDate <= now ? "due" : "scheduled";
}

export const BILLING_READINESS_LABELS: Record<BillingReadiness, string> = {
  inactive: "الاشتراك غير نشط", awaiting_first_payment: "بانتظار أول دفعة مؤكدة",
  billing_history_missing: "دفعة مؤكدة تحتاج مطابقة تاريخ التجديد", schedule_invalid: "موعد التجديد غير صالح",
  authorization_missing: "تفويض الدفع غير مرتبط", schedule_missing: "موعد التجديد غير محدد",
  reconciliation_required: "تغيير المبلغ يحتاج مطابقة", processing: "دورة قيد المعالجة",
  provider_managed: "الفوترة لدى المزوّد", due: "مستحق للجدولة", scheduled: "مجدول للموعد القادم",
};
