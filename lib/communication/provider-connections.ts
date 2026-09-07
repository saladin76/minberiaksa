import { communicationProviderRegistry } from "./provider-registry";
import { getActiveCommunicationRuntimeBundle, getActiveBrevoWebhookSecret, getActiveElasticEmailWebhookSecret } from "./runtime-config";
import type { CommunicationProviderKey, ProviderConnection, ProviderConnectionStatus } from "./communication-types";

export type ProviderRequirement = { id: string; label: string; configured: boolean; required: boolean };
export type ProviderConnectionReadiness = ProviderConnection & {
  requirements: ProviderRequirement[];
  configuredRequiredCount: number;
  requiredCount: number;
  readinessPercent: number;
  actionLabel: string;
};

function statusFromRequirements(provider: ProviderConnection, requirements: ProviderRequirement[], enabled: boolean): ProviderConnectionStatus {
  if (!enabled || provider.status === "DISABLED") return "DISABLED";
  const required = requirements.filter((item) => item.required);
  const configured = required.filter((item) => item.configured);
  if (required.length && configured.length === required.length) return "CONFIGURED";
  if (configured.length) return "NEEDS_ATTENTION";
  return "NOT_CONFIGURED";
}

export async function getProviderConnectionsReadiness(): Promise<ProviderConnectionReadiness[]> {
  const [runtime, emailWebhook, smsWebhook] = await Promise.all([
    getActiveCommunicationRuntimeBundle(),
    getActiveElasticEmailWebhookSecret(),
    getActiveBrevoWebhookSecret(),
  ]);
  return communicationProviderRegistry.map((provider) => {
    let enabled = true;
    let requirements: ProviderRequirement[];
    if (provider.key === "META_WHATSAPP") {
      enabled = runtime.meta.enabled;
      requirements = [
        { id: "business_account", label: "حساب WhatsApp Business", configured: runtime.meta.configured, required: true },
        { id: "phone_number", label: "رقم واتساب للإرسال", configured: runtime.meta.configured && !!runtime.meta.values.defaultPhoneNumberId, required: true },
        { id: "access_token", label: "صلاحية وصول آمنة", configured: runtime.meta.configured, required: true },
        { id: "webhook_verify", label: "Webhook للتحقق واستقبال الحالات", configured: runtime.meta.configured, required: true },
      ];
    } else if (provider.key === "ELASTIC_EMAIL") {
      enabled = runtime.elasticEmail.enabled;
      requirements = [
        { id: "sender", label: "مرسل الإيميل المعتمد", configured: runtime.elasticEmail.configured && !!runtime.elasticEmail.values.senderEmail, required: true },
        { id: "api_key", label: "صلاحية API آمنة", configured: runtime.elasticEmail.configured, required: true },
        { id: "webhook", label: "Webhook لحالات الإرسال", configured: emailWebhook.configured, required: false },
      ];
    } else if (provider.key === "BREVO_SMS") {
      enabled = runtime.brevoSms.enabled;
      requirements = [
        { id: "sender", label: "اسم أو رقم مرسل SMS", configured: runtime.brevoSms.configured && !!runtime.brevoSms.values.sender, required: true },
        { id: "api_key", label: "صلاحية API آمنة", configured: runtime.brevoSms.configured, required: true },
        { id: "country_rules", label: "التوجيه للأرقام الدولية", configured: true, required: true },
        { id: "webhook", label: "Webhook لحالات الإرسال", configured: smsWebhook.configured, required: false },
      ];
    } else {
      enabled = false;
      requirements = [
        { id: "provider", label: "المزودات الاحتياطية القديمة غير مستخدمة", configured: false, required: true },
      ];
    }
    const required = requirements.filter((item) => item.required);
    const configuredRequiredCount = required.filter((item) => item.configured).length;
    const status = statusFromRequirements(provider, requirements, enabled);
    return {
      ...provider,
      status,
      requirements,
      configuredRequiredCount,
      requiredCount: required.length,
      readinessPercent: required.length ? Math.round((configuredRequiredCount / required.length) * 100) : 0,
      actionLabel: status === "CONFIGURED" ? "جاهز للاختبار الآمن" : status === "NEEDS_ATTENTION" ? "أكمل الإعداد" : status === "DISABLED" ? "غير مستخدم" : "لم يبدأ الربط",
    };
  });
}
