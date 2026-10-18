import type { IntegrationProvider } from "./catalog";
import type { SafeIntegrationProviderSnapshot } from "./types";
import { dt } from "@/lib/dashboard/i18n";

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
  get READY() { return dt("جاهز"); },
  get NEEDS_SETUP() { return dt("يحتاج إعداد"); },
  get PENDING_TEST() { return dt("تغييرات بانتظار الاختبار"); },
  get PENDING_ACTIVATION() { return dt("نجح الاختبار وينتظر الاعتماد"); },
  get TEST_FAILED() { return dt("فشل الاختبار"); },
  get DISABLED() { return dt("معطل"); },
  get ENCRYPTION_ERROR() { return dt("خطأ في التشفير"); },
  get ENCRYPTION_KEY_MISSING() { return dt("مفتاح التشفير غير مضبوط"); },
};

export const PROVIDER_USAGE: Record<IntegrationProvider, string> = {
  get META_WHATSAPP() { return dt("إرسال واتساب عبر Meta Cloud API"); },
  get ELASTIC_EMAIL() { return dt("إرسال جميع رسائل البريد الإلكتروني"); },
  get BREVO() { return dt("إرسال SMS للأرقام الدولية (غير التركية)"); },
  get NETGSM() { return dt("إرسال SMS إلى أرقام تركيا +90"); },
  get SYSTEM() { return dt("بنية Cron التحتية وحماية الجدولة"); },
};

export const PROVIDER_UI_LABEL: Record<IntegrationProvider, string> = {
  META_WHATSAPP: "Meta WhatsApp",
  ELASTIC_EMAIL: "Elastic Email",
  BREVO: "Brevo SMS",
  NETGSM: "Netgsm",
  get SYSTEM() { return dt("الجدولة Cron"); },
};

/**
 * Field help is keyed by field key, and the same key can exist on more than one provider
 * (API_KEY on Elastic Email and Brevo, WEBHOOK_SECRET on both). `fieldHelp()` prefers the
 * provider-scoped entry and falls back to the shared one.
 */
export const FIELD_HELP: Record<string, string> = {
  get ACCESS_TOKEN() { return dt("من Meta Business Manager ضمن إعدادات WhatsApp API ورمز الوصول الدائم."); },
  get APP_ID() { return dt("من Meta for Developers > Settings > Basic. مطلوب لرفع عينات الصور/الفيديو/المستندات عبر Resumable Upload API."); },
  get BUSINESS_PORTFOLIO_ID() { return dt("معرّف Business Portfolio الرئيسي في Meta Business Suite. يستخدم لاكتشاف WABA المملوكة/المشاركة والتأكد أن كل مُرسِل تابع للحساب الرئيسي."); },
  get APP_SECRET() { return dt("من إعدادات تطبيق Meta ضمن Basic Settings. يُستخدم للتحقق من App Secret Proof وتوقيع Webhook."); },
  get WEBHOOK_VERIFY_TOKEN() { return dt("قيمة تختارها داخل النظام، ثم تدخل القيمة نفسها عند إعداد Webhook في Meta."); },
  get BUSINESS_ACCOUNT_ID() { return dt("معرّف WhatsApp Business Account الظاهر في إعدادات WhatsApp Manager."); },
  get DEFAULT_PHONE_NUMBER_ID() { return dt("معرّف رقم الهاتف من صفحة API Setup داخل تطبيق Meta."); },
  get GRAPH_API_VERSION() { return dt("إصدار Graph API المستخدم، مثل v23.0."); },
  get API_KEY() { return dt("مفتاح API الخاص بالمزود."); },
  get "ELASTIC_EMAIL.API_KEY"() { return dt("من Elastic Email: Settings ثم API Keys  يحتاج صلاحية إرسال البريد."); },
  get "ELASTIC_EMAIL.SENDER_NAME"() { return dt("الاسم الذي يظهر للمستلم في رسائل البريد."); },
  get "ELASTIC_EMAIL.SENDER_EMAIL"() { return dt("بريد مرسل على نطاق موثّق (SPF/DKIM) داخل Elastic Email."); },
  get "ELASTIC_EMAIL.WEBHOOK_SECRET"() { return dt("رمز حماية Webhook يُنشأ داخل السيرفر ويُلصق في رابط إشعارات Elastic Email."); },
  get "BREVO.API_KEY"() { return dt("من Brevo: SMTP & API ثم API Keys."); },
  get SMS_SENDER() { return dt("اسم المرسل الدولي المسجل أو المسموح به داخل Brevo."); },
  get WEBHOOK_SECRET() { return dt("رمز حماية Webhook يتم إنشاؤه وتدويره داخل السيرفر."); },
  get USERCODE() { return dt("رمز مستخدم Netgsm الخاص بالحساب."); },
  get PASSWORD() { return dt("كلمة مرور API لحساب Netgsm."); },
  get HEADER() { return dt("اسم المرسل المعتمد داخل حساب Netgsm."); },
  get CRON_SECRET() { return dt("إعداد بنية تحتية يُحفظ داخل Vercel فقط."); },
};

export function fieldHelp(provider: IntegrationProvider, key: string): string {
  return FIELD_HELP[`${provider}.${key}`] ?? FIELD_HELP[key] ?? "";
}

export const ERROR_MESSAGES_AR: Record<string, string> = {
  get META_UNAUTHORIZED() { return dt("رمز الوصول غير صالح أو انتهت صلاحيته."); },
  get META_APP_SECRET_MISMATCH() { return dt("App Secret لا يتوافق مع Access Token."); },
  get META_BUSINESS_ACCOUNT_UNAVAILABLE() { return dt("تعذر الوصول إلى حساب أعمال Meta."); },
  get META_BUSINESS_PORTFOLIO_UNAVAILABLE() { return dt("تعذر الوصول إلى حساب الأعمال الرئيسي في Meta. تحقق من Business Portfolio ID ومن أن صاحب رمز الوصول عضو فيه."); },
  get META_BUSINESS_WABAS_UNAVAILABLE() { return dt("تم الوصول إلى حساب الأعمال الرئيسي لكن تعذرت قراءة حسابات WhatsApp Business التابعة له. أعد المحاولة لاحقًا."); },
  get META_TOKEN_EXPIRING() { return dt("رمز الوصول مؤقت وينتهي خلال أقل من 3 أيام. أنشئ رمز System User دائمًا من إعدادات أعمال Meta بصلاحيات whatsapp_business_management وwhatsapp_business_messaging وbusiness_management."); },
  get META_TOKEN_MISSING_WHATSAPP_SCOPES() { return dt("رمز الوصول لا يملك صلاحيتي whatsapp_business_management وwhatsapp_business_messaging."); },
  get META_WABA_NOT_IN_BUSINESS_PORTFOLIO() { return dt("حساب WABA المحدد غير موجود ضمن حساب الأعمال الرئيسي أو الحسابات المشاركة معه."); },
  get META_PHONE_NUMBER_MISMATCH() { return dt("رقم واتساب المحدد لا يتبع حساب الأعمال."); },
  get META_PHONE_NUMBER_UNAVAILABLE() { return dt("تعذر الوصول إلى رقم واتساب المحدد."); },
  get ELASTIC_EMAIL_UNAUTHORIZED() { return dt("مفتاح Elastic Email غير صالح أو انتهت صلاحيته."); },
  get ELASTIC_EMAIL_SENDER_DOMAIN_NOT_VERIFIED() { return dt("نطاق بريد المرسل غير موثّق داخل Elastic Email."); },
  get ELASTIC_EMAIL_SENDER_INVALID() { return dt("بريد المرسل غير صالح."); },
  get ELASTIC_EMAIL_ACCOUNT_UNAVAILABLE() { return dt("تعذر الوصول إلى حساب Elastic Email."); },
  get ELASTIC_EMAIL_CONFIGURATION_INCOMPLETE() { return dt("بيانات Elastic Email غير مكتملة."); },
  get BREVO_UNAUTHORIZED() { return dt("مفتاح Brevo غير صالح."); },
  get BREVO_SMS_SENDER_INVALID() { return dt("اسم مرسل SMS غير صالح."); },
  get NETGSM_AUTH_REJECTED() { return dt("بيانات دخول Netgsm غير صحيحة."); },
  get NETGSM_HEADER_NOT_AVAILABLE() { return dt("اسم المرسل غير متاح في حساب Netgsm."); },
  get CRON_SECRET_INVALID() { return dt("مفتاح الجدولة لا يحقق متطلبات الأمان."); },
  get CRON_SECRET_MISSING() { return dt("مفتاح Cron غير مضبوط داخل Vercel."); },
  get CANDIDATE_NOT_VERIFIED() { return dt("يجب نجاح اختبار التغييرات قبل اعتماد الإعدادات."); },
  get CANDIDATE_VERSION_MISMATCH() { return dt("تم تغيير الإعدادات منذ آخر اختبار. أعد الاختبار من جديد."); },
  get CANDIDATE_NOT_FOUND() { return dt("لا توجد تغييرات محفوظة تحتاج إلى اختبار."); },
  get ENCRYPTION_KEY_MISSING() { return dt("مفتاح تشفير إعدادات التكاملات غير مضبوط على السيرفر."); },
  get ENCRYPTION_KEY_INVALID() { return dt("مفتاح تشفير إعدادات التكاملات غير صالح."); },
  get MISSING_REQUIRED_FIELDS() { return dt("بعض البيانات المطلوبة غير مكتملة."); },
  get PROVIDER_DISABLED() { return dt("المزوّد معطّل داخل النظام. البيانات محفوظة ولن تُستخدم حتى يُعاد تفعيله."); },
  get INTEGRATION_DATABASE_UNAVAILABLE() { return dt("تعذرت قراءة إعدادات التكامل من قاعدة البيانات."); },
  get INTEGRATION_DECRYPTION_FAILED() { return dt("تعذر فك تشفير قيم محفوظة. تحقق من مفتاح تشفير الإعدادات."); },
  get CANONICAL_URL_MISSING() { return dt("تعذر تحديد النطاق الرسمي للموقع من إعدادات السيرفر."); },
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
