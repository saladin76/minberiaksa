import { dt } from "./i18n";
import type { ReductionBlockReason } from "../donations/subscription-reduction-policy";

export function reductionBlockMessage(reason: ReductionBlockReason | null): string {
  switch (reason) {
    case "RETRY_PENDING": return dt("توجد محاولات تحصيل غير ناجحة لهذه الدورة. راجع آخر سبب لتعذّر الخصم، ثم حدّث الحالة بعد تسوية الدورة. يبقى طلب المتبرع محفوظًا دون تنفيذ.");
    case "BILLING_IN_PROGRESS": return dt("تجري معالجة تحصيل لهذا الاشتراك. انتظر ظهور نتيجته ثم حدّث الحالة؛ لم يُنفّذ التخفيض.");
    case "RECONCILIATION_REQUIRED": return dt("يوجد تغيير يحتاج مطابقة مع مزوّد الدفع. راجع نتيجته قبل أي محاولة جديدة؛ لا تُكرر التخفيض قبل التحقق.");
    case "SCHEDULE_MISSING": return dt("موعد التحصيل غير محدد أو غير صالح. راجع جدولة الاشتراك قبل التخفيض؛ لم يُنفّذ التخفيض.");
    case "PLAN_INACTIVE": return dt("يمكن تخفيض الاشتراكات النشطة أو المتوقفة مؤقتًا فقط. حدّث الحالة لمراجعة الاشتراك.");
    default: return dt("موعد التحصيل قريب أو مستحق خلال 24 ساعة. حدّث الحالة بعد تسوية هذه الدورة؛ يبقى طلب المتبرع محفوظًا دون تنفيذ.");
  }
}

/** Unknown server prose must not leak as untranslated instructions or imply success. */
export function reductionErrorMessage(code: unknown, reason?: ReductionBlockReason | null): string {
  switch (code) {
    case "BILLING_WINDOW_LOCKED": return reductionBlockMessage(reason ?? null);
    case "RECONCILE_REQUIRED": return reductionBlockMessage("RECONCILIATION_REQUIRED");
    case "DONOR_REQUEST_MISMATCH": return dt("طلب المتبرع غير صالح لهذا الاشتراك أو لهذا المبلغ.");
    case "PLAN_CHANGED_CONCURRENTLY": return dt("تغيّر الاشتراك أثناء المراجعة. حدّث حالته وراجع المبلغ والطلب قبل التأكيد مجددًا.");
    default: return dt("تعذّر التخفيض. لم يُؤكّد تنفيذ التغيير؛ حدّث حالة الاشتراك وراجع النتيجة قبل إعادة المحاولة.");
  }
}
