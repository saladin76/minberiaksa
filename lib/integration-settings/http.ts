import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { isIntegrationProvider, type IntegrationProvider } from "./catalog";
import { IntegrationSettingsError, type IntegrationSettingsActor } from "./service";

export function integrationProviderFromParam(value: string): IntegrationProvider | null {
  const normalized = value.trim().toUpperCase();
  return isIntegrationProvider(normalized) ? normalized : null;
}

export function integrationActorFromSession(session: Session): IntegrationSettingsActor {
  return auditActorFromDashboardSession(session);
}

export function integrationSettingsErrorResponse(error: unknown): NextResponse {
  if (!(error instanceof IntegrationSettingsError)) {
    return NextResponse.json({ error: "تعذر تنفيذ عملية إعداد التكامل." }, { status: 500 });
  }

  const conflictCodes = new Set([
    "CANDIDATE_NOT_FOUND",
    "CANDIDATE_NOT_VERIFIED",
    "CANDIDATE_VERSION_MISMATCH",
    "CANDIDATE_CHANGED_DURING_TEST",
    "EMPTY_CANDIDATE",
  ]);
  const status = error.code === "SETTING_NOT_FOUND" ? 404
    : conflictCodes.has(error.code) ? 409
    : error.code === "ENCRYPTION_KEY_MISSING" || error.code === "ENCRYPTION_KEY_INVALID" || error.code === "REPOSITORY_FAILURE" ? 503
    : 400;

  const messages: Record<string, string> = {
    UNKNOWN_FIELD: "حقل الإعداد غير معروف.",
    INVALID_FIELD_VALUE: error.message || "قيمة حقل الإعداد غير صالحة.",
    DUPLICATE_FIELD: "تم إرسال الحقل أكثر من مرة.",
    SETTING_NOT_FOUND: "الإعداد غير موجود.",
    CANDIDATE_NOT_FOUND: "لا يوجد تكوين جديد بانتظار الاختبار أو الاعتماد.",
    CANDIDATE_NOT_VERIFIED: "يجب نجاح اختبار اتصال حقيقي للتكوين الحالي قبل اعتماده.",
    CANDIDATE_VERSION_MISMATCH: "تم تعديل التكوين المرشح. أعد تحميل الإعدادات واختبرها من جديد.",
    CANDIDATE_CHANGED_DURING_TEST: "تغير التكوين أثناء الاختبار، لذلك تم تجاهل النتيجة ويجب إعادة الاختبار.",
    EMPTY_CANDIDATE: "لا يحتوي التكوين المرشح على تغييرات قابلة للاعتماد.",
    ENCRYPTION_KEY_MISSING: "مفتاح تشفير إعدادات التكاملات غير مُعد.",
    ENCRYPTION_KEY_INVALID: "مفتاح تشفير إعدادات التكاملات غير صالح.",
    REPOSITORY_FAILURE: "تعذر الوصول إلى إعدادات التكاملات.",
  };

  return NextResponse.json({ error: messages[error.code] ?? "تعذر تنفيذ عملية إعداد التكامل.", code: error.code }, { status });
}
