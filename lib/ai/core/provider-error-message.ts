import { dt } from "../../dashboard/i18n";

/** Never display raw upstream errors: they can echo request content. */
export function providerErrorMessage(code?: string): string {
  switch (code) {
    case "AI_NOT_CONFIGURED": return dt("اتصال الذكاء الاصطناعي غير مفعّل أو لم يُربط مفتاح. راجع إعداد الاتصال المركزي.");
    case "AI_SETTINGS_UNAVAILABLE": return dt("تعذر قراءة إعداد اتصال الذكاء الاصطناعي. راجع الاتصال والتشفير على الخادم.");
    case "AI_ACCESS_DENIED": return dt("رفض مزوّد الذكاء الاصطناعي صلاحية الوصول. راجع المفتاح وصلاحيات المشروع.");
    case "AI_MODEL_UNAVAILABLE": return dt("النموذج المحدد غير متاح لهذا المشروع. راجع إعداد النموذج على الخادم.");
    case "AI_QUOTA_EXCEEDED": return dt("رصيد خدمة الذكاء الاصطناعي أو حد الإنفاق غير كافٍ. راجع فوترة المزوّد.");
    case "AI_RATE_LIMITED": return dt("بلغت خدمة الذكاء الاصطناعي حد الطلبات المؤقت. أعد المحاولة لاحقًا.");
    case "AI_INVALID_REQUEST": return dt("رفض المزوّد صيغة الطلب أو إحدى أدواته. راجع توافق النموذج وإعدادات الخدمة.");
    case "AI_OUTPUT_INCOMPLETE": return dt("لم يكتمل رد التحليل. لم تُعتمد نتيجة جزئية؛ أعد المحاولة.");
    case "AI_OUTPUT_INVALID": return dt("أعاد المزوّد نتيجة غير قابلة للمراجعة. لم يتغير المحتوى؛ جرّب عينة واحدة بعد المراجعة.");
    case "AI_EMPTY_RESPONSE": return dt("لم يُرجع المزوّد نصًا للاقتراح. لم يتغير المحتوى المحفوظ.");
    case "AI_RESPONSE_REFUSED": return dt("لم يُرجع المزوّد تحليلًا مسموحًا لهذا الطلب. راجع المدخلات.");
    case "AI_TIMEOUT": return dt("استغرق التحليل وقتًا أطول من المهلة المتاحة. أعد المحاولة.");
    case "AI_PROVIDER_UNAVAILABLE": return dt("خدمة الذكاء الاصطناعي غير متاحة حاليًا. أعد المحاولة لاحقًا.");
    default: return dt("تعذّر إعداد تحليل موثق. أعد المحاولة لاحقًا.");
  }
}
