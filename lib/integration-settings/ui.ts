import type { IntegrationProvider } from "./catalog";
import type { SafeIntegrationProviderSnapshot } from "./types";

export type IntegrationUiStatus =
  | "READY"
  | "NEEDS_SETUP"
  | "PENDING_TEST"
  | "PENDING_ACTIVATION"
  | "TEST_FAILED"
  | "DISABLED"
  | "ENCRYPTION_ERROR"
  | "ENCRYPTION_KEY_MISSING";

export const INTEGRATION_UI_STATUS_LABEL: Record<IntegrationUiStatus, string> = {
  READY: "جاهز",
  NEEDS_SETUP: "يحتاج إعداد",
  PENDING_TEST: "تغييرات بانتظار الاختبار",
  PENDING_ACTIVATION: "نجح الاختبار وينتظر الاعتماد",
  TEST_FAILED: "فشل الاختبار",
  DISABLED: "معطل",
  ENCRYPTION_ERROR: "خطأ في التشفير",
  ENCRYPTION_KEY_MISSING: "مفتاح التشفير غير مضبوط",
};

export const PROVIDER_USAGE: Record<IntegrationProvider, string> = {
  META_WHATSAPP: "إرسال واتساب عبر Meta Cloud API",
  ELASTIC_EMAIL: "إرسال جميع رسائل البريد الإلكتروني",
  BREVO: "إرسال SMS للأرقام الدولية (غير التركية)",
  NETGSM: "إرسال SMS إلى أرقام تركيا +90",
  SYSTEM: "بنية Cron التحتية وحماية الجدولة",
};

export const PROVIDER_UI_LABEL: Record<IntegrationProvider, string> = {
  META_WHATSAPP: "Meta WhatsApp",
  ELASTIC_EMAIL: "Elastic Email",
  BREVO: "Brevo SMS",
  NETGSM: "Netgsm",
  SYSTEM: "الجدولة Cron",
};

/**
 * Field help is keyed by field key, and the same key can exist on more than one provider
 * (API_KEY on Elastic Email and Brevo, WEBHOOK_SECRET on both). `fieldHelp()` prefers the
 * provider-scoped entry and falls back to the shared one.
 */
export const FIELD_HELP: Record<string, string> = {
  ACCESS_TOKEN: "من Meta Business Manager ضمن إعدادات WhatsApp API ورمز الوصول الدائم.",
  APP_SECRET: "من إعدادات تطبيق Meta ضمن Basic Settings. يُستخدم للتحقق من App Secret Proof وتوقيع Webhook.",
  WEBHOOK_VERIFY_TOKEN: "قيمة تختارها داخل النظام، ثم تدخل القيمة نفسها عند إعداد Webhook في Meta.",
  BUSINESS_ACCOUNT_ID: "معرّف WhatsApp Business Account الظاهر في إعدادات WhatsApp Manager.",
  DEFAULT_PHONE_NUMBER_ID: "معرّف رقم الهاتف من صفحة API Setup داخل تطبيق Meta.",
  GRAPH_API_VERSION: "إصدار Graph API المستخدم، مثل v23.0.",
  API_KEY: "مفتاح API الخاص بالمزود.",
  "ELASTIC_EMAIL.API_KEY": "من Elastic Email: Settings ثم API Keys — يحتاج صلاحية إرسال البريد.",
  "ELASTIC_EMAIL.SENDER_NAME": "الاسم الذي يظهر للمستلم في رسائل البريد.",
  "ELASTIC_EMAIL.SENDER_EMAIL": "بريد مرسل على نطاق موثّق (SPF/DKIM) داخل Elastic Email.",
  "ELASTIC_EMAIL.WEBHOOK_SECRET": "رمز حماية Webhook يُنشأ داخل السيرفر ويُلصق في رابط إشعارات Elastic Email.",
  "BREVO.API_KEY": "من Brevo: SMTP & API ثم API Keys.",
  SMS_SENDER: "اسم المرسل الدولي المسجل أو المسموح به داخل Brevo.",
  WEBHOOK_SECRET: "رمز حماية Webhook يتم إنشاؤه وتدويره داخل السيرفر.",
  USERCODE: "رمز مستخدم Netgsm الخاص بالحساب.",
  PASSWORD: "كلمة مرور API لحساب Netgsm.",
  HEADER: "اسم المرسل المعتمد داخل حساب Netgsm.",
  CRON_SECRET: "إعداد بنية تحتية يُحفظ داخل Vercel فقط.",
};

export function fieldHelp(provider: IntegrationProvider, key: string): string {
  return FIELD_HELP[`${provider}.${key}`] ?? FIELD_HELP[key] ?? "";
}

export const ERROR_MESSAGES_AR: Record<string, string> = {
  META_UNAUTHORIZED: "رمز الوصول غير صالح أو انتهت صلاحيته.",
  META_APP_SECRET_MISMATCH: "App Secret لا يتوافق مع Access Token.",
  META_BUSINESS_ACCOUNT_UNAVAILABLE: "تعذر الوصول إلى حساب أعمال Meta.",
  META_PHONE_NUMBER_MISMATCH: "رقم واتساب المحدد لا يتبع حساب الأعمال.",
  META_PHONE_NUMBER_UNAVAILABLE: "تعذر الوصول إلى رقم واتساب المحدد.",
  ELASTIC_EMAIL_UNAUTHORIZED: "مفتاح Elastic Email غير صالح أو انتهت صلاحيته.",
  ELASTIC_EMAIL_SENDER_DOMAIN_NOT_VERIFIED: "نطاق بريد المرسل غير موثّق داخل Elastic Email.",
  ELASTIC_EMAIL_SENDER_INVALID: "بريد المرسل غير صالح.",
  ELASTIC_EMAIL_ACCOUNT_UNAVAILABLE: "تعذر الوصول إلى حساب Elastic Email.",
  ELASTIC_EMAIL_CONFIGURATION_INCOMPLETE: "بيانات Elastic Email غير مكتملة.",
  BREVO_UNAUTHORIZED: "مفتاح Brevo غير صالح.",
  BREVO_SMS_SENDER_INVALID: "اسم مرسل SMS غير صالح.",
  NETGSM_AUTH_REJECTED: "بيانات دخول Netgsm غير صحيحة.",
  NETGSM_HEADER_NOT_AVAILABLE: "اسم المرسل غير متاح في حساب Netgsm.",
  CRON_SECRET_INVALID: "مفتاح الجدولة لا يحقق متطلبات الأمان.",
  CRON_SECRET_MISSING: "مفتاح Cron غير مضبوط داخل Vercel.",
  CANDIDATE_NOT_VERIFIED: "يجب نجاح اختبار التغييرات قبل اعتماد الإعدادات.",
  CANDIDATE_VERSION_MISMATCH: "تم تغيير الإعدادات منذ آخر اختبار. أعد الاختبار من جديد.",
  CANDIDATE_NOT_FOUND: "لا توجد تغييرات محفوظة تحتاج إلى اختبار.",
  ENCRYPTION_KEY_MISSING: "مفتاح تشفير إعدادات التكاملات غير مضبوط على السيرفر.",
  ENCRYPTION_KEY_INVALID: "مفتاح تشفير إعدادات التكاملات غير صالح.",
  MISSING_REQUIRED_FIELDS: "بعض البيانات المطلوبة غير مكتملة.",
  CANONICAL_URL_MISSING: "تعذر تحديد النطاق الرسمي للموقع من إعدادات السيرفر.",
};

export function uiStatus(snapshot: SafeIntegrationProviderSnapshot): IntegrationUiStatus {
  if (snapshot.provider === "SYSTEM") return snapshot.status === "READY" ? "READY" : "NEEDS_SETUP";
  if (!snapshot.encryptionKeyConfigured) return "ENCRYPTION_KEY_MISSING";
  if (!snapshot.enabled) return "DISABLED";
  if (snapshot.status === "ERROR") return "ENCRYPTION_ERROR";
  if (snapshot.candidate.hasChanges) {
    if (snapshot.candidate.lastTestResult === "SUCCESS" && snapshot.candidate.lastTestAt) return "PENDING_ACTIVATION";
    if (snapshot.candidate.lastTestResult === "FAILED") return "TEST_FAILED";
    return "PENDING_TEST";
  }
  return snapshot.status === "READY" ? "READY" : "NEEDS_SETUP";
}

export function safeErrorMessage(code: string | null | undefined, fallback: string): string {
  return code ? ERROR_MESSAGES_AR[code] ?? fallback : fallback;
}
