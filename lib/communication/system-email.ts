import "server-only";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { getActiveElasticEmailRuntimeConfig, type ElasticEmailRuntimeValues, type ActiveRuntimeConfig } from "./runtime-config";
import { sendEmailMessage, EMAIL_PROVIDER_ID } from "./providers/email/client";

export type ArchivedEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  recipientUserId?: string | null;
  recipientName?: string | null;
  locale?: string | null;
  origin?: "SYSTEM" | "MANUAL" | "TEST" | "TRIGGER" | "CAMPAIGN";
  purpose?: "TRANSACTIONAL" | "MARKETING" | "UTILITY";
  templateId?: string | null;
  templateName?: string | null;
  createdBy?: string | null;
};

export type ArchivedEmailResult =
  | { ok: true; deliveryId: string; providerMessageId: string | null }
  | { ok: false; reason: string; deliveryId?: string };

export async function sendArchivedEmail(input: ArchivedEmailInput, runtime?: ActiveRuntimeConfig<ElasticEmailRuntimeValues>): Promise<ArchivedEmailResult> {
  const created = await createDeliveryRecord({
    channel: "EMAIL",
    provider: EMAIL_PROVIDER_ID,
    recipientEmail: input.to,
    recipientUserId: input.recipientUserId ?? null,
    recipientName: input.recipientName ?? null,
    locale: input.locale ?? null,
    origin: input.origin ?? "SYSTEM",
    purpose: input.purpose ?? "TRANSACTIONAL",
    templateId: input.templateId ?? null,
    templateName: input.templateName ?? null,
    renderedSubject: input.subject,
    renderedBody: input.html,
    createdBy: input.createdBy ?? null,
    status: "RENDERED",
  });
  if (!created.ok) return { ok: false, reason: "ARCHIVE_FAILED" };
  const deliveryId = created.data.id;
  const config = runtime ?? await getActiveElasticEmailRuntimeConfig();
  const result = await sendEmailMessage({ to: input.to, subject: input.subject, html: input.html, text: input.text }, config);
  if (!result.ok) {
    const terminal = result.reason.endsWith("_NOT_CONFIGURED") || result.reason === "PROVIDER_DISABLED" || result.reason === "INTEGRATION_DECRYPTION_FAILED" || result.reason === "INTEGRATION_DATABASE_UNAVAILABLE";
    await markDeliveryStatus(deliveryId, terminal ? "SKIPPED" : "FAILED", { errorMessage: result.reason });
    return { ok: false, reason: result.reason, deliveryId };
  }
  await markDeliveryStatus(deliveryId, "SENT", { providerMessageId: result.providerMessageId, internalAccepted: result.internalAccepted });
  return { ok: true, deliveryId, providerMessageId: result.providerMessageId };
}

const SUBJECTS: Record<string, string> = {
  ar: "تأكيد بريدك الإلكتروني",
  tr: "E-posta adresinizi doğrulayın",
  fr: "Confirmez votre adresse e-mail",
  es: "Confirma tu correo electrónico",
  pt: "Confirme o seu e-mail",
  id: "Konfirmasi alamat email Anda",
  en: "Confirm your email address",
};

export async function sendVerificationEmailViaRuntime(to: string, verificationUrl: string, locale = "en"): Promise<ArchivedEmailResult> {
  const lang = SUBJECTS[locale] ? locale : "en";
  const subject = SUBJECTS[lang];
  const direction = lang === "ar" ? "rtl" : "ltr";
  const html = `<!doctype html><html lang="${lang}" dir="${direction}"><body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:32px"><main style="max-width:560px;margin:auto;background:#fff;padding:32px;border-radius:14px"><h1 style="font-size:22px">${subject}</h1><p>${lang === "ar" ? "اضغط على الزر التالي لتأكيد حسابك." : "Use the button below to confirm your account."}</p><p><a href="${verificationUrl}" style="display:inline-block;padding:12px 22px;background:#025EB8;color:#fff;text-decoration:none;border-radius:8px">${subject}</a></p><p style="font-size:12px;word-break:break-all">${verificationUrl}</p></main></body></html>`;
  return sendArchivedEmail({ to, subject, html, locale: lang, origin: "SYSTEM", purpose: "TRANSACTIONAL", templateName: "EMAIL_VERIFICATION" });
}
