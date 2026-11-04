import { sendEmailMessage } from "@/lib/communication/providers/email/client";
import { getActiveElasticEmailRuntimeConfig, getActiveMetaWhatsappRuntimeConfig } from "@/lib/communication/runtime-config";
import { sendTemplateMessage } from "@/lib/communication/providers/meta-whatsapp/messages";
import { listApprovedTemplates } from "@/lib/communication/providers/meta-whatsapp/templates";
import { createDeliveryRecord, markDeliveryStatus } from "@/lib/communication/delivery-log-service";
import type { LoginChannel } from "./donor-login-policy";
import { donorAuthenticationSender } from "./donor-authentication-sender";
import { donorLoginEmail } from "./donor-login-email";

/** Authentication codes and bearer links must never enter the communication archive. */
export async function deliverLoginCode(input: { channel: LoginChannel; contact: string; code: string; locale: string; userId?: string; loginUrl?: string }) {
  const sender = input.channel === "WHATSAPP" ? await donorAuthenticationSender() : null;
  const record = await createDeliveryRecord({ channel: input.channel, senderId: sender?.id, provider: input.channel === "EMAIL" ? "ELASTIC_EMAIL" : "META_WHATSAPP", purpose: "AUTHENTICATION", origin: "SYSTEM", recipientEmail: input.channel === "EMAIL" ? input.contact : null, recipientPhone: input.channel === "WHATSAPP" ? input.contact : null, recipientUserId: input.userId, templateName: "DONOR_LOGIN", renderedBody: "[Authentication code redacted]", locale: input.locale });
  if (!record.ok) throw new Error("DELIVERY_UNAVAILABLE");
  let result: { ok: boolean; providerMessageId?: string | null; reason?: string };
  try {
    if (input.channel === "EMAIL") {
      const message = donorLoginEmail(input.code, input.locale, input.loginUrl);
      result = await sendEmailMessage({ to: input.contact, ...message, purpose: "AUTHENTICATION" }, await getActiveElasticEmailRuntimeConfig());
    } else {
      const runtime = await getActiveMetaWhatsappRuntimeConfig();
      const templateName = process.env.DONOR_LOGIN_WHATSAPP_TEMPLATE || "mia_donor_login_v1";
      const languageCode = process.env.DONOR_LOGIN_WHATSAPP_LANGUAGE || "ar";
      const phoneNumberId = sender?.phoneNumberId;
      if (!runtime.configured || !phoneNumberId || !templateName) throw new Error("WHATSAPP_AUTH_NOT_CONFIGURED");
      const catalog = await listApprovedTemplates(sender!.businessAccountId, runtime);
      if (!catalog.ok || !catalog.templates.some(t => t.name === templateName && t.language === languageCode && t.category === "AUTHENTICATION" && t.status === "APPROVED")) throw new Error("WHATSAPP_AUTH_TEMPLATE_NOT_APPROVED");
      result = await sendTemplateMessage({ phoneNumberId, to: input.contact, templateName, languageCode, components: [
        { type: "body", parameters: [{ type: "text", text: input.code }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: input.code }] },
      ] }, runtime);
    }
  } catch {
    await markDeliveryStatus(record.data.id, "FAILED", { errorMessage: "AUTH_DELIVERY_UNAVAILABLE" });
    throw new Error("DELIVERY_UNAVAILABLE");
  }
  if (!result.ok || !result.providerMessageId) {
    await markDeliveryStatus(record.data.id, "FAILED", { errorMessage: result.reason || "AUTH_DELIVERY_UNCONFIRMED" });
    throw new Error("DELIVERY_UNAVAILABLE");
  }
  await markDeliveryStatus(record.data.id, "SENT", { providerMessageId: result.providerMessageId });
  return { deliveryId: record.data.id, providerMessageId: result.providerMessageId };
}
