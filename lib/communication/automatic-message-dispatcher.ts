import type { Prisma, MessageTriggerEvent } from "@prisma/client";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { sendPreparedDelivery } from "./provider-router";
import { EMAIL_PROVIDER_ID } from "./providers/email/client";
import { logSentMessage } from "@/lib/messaging/log-sent";
import type { CommunicationPurposeId } from "./communication-runtime-types";

/**
 * Automatic (trigger-fired) message dispatcher for the Communication Center.
 *
 * Every automatic donation/subscription message now flows through the FINAL provider architecture:
 *   - EMAIL    → Elastic Email (via ProviderRouter). Never SendGrid, never Brevo.
 *   - WHATSAPP → Meta WhatsApp Cloud API using an APPROVED template. Never Twilio. If the stored
 *                WhatsappTemplate has no Meta-approved template mapping, the send is SKIPPED with
 *                `META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP` (never faked, never Twilio).
 *   - SMS      → TR (+90) → Netgsm, international → Brevo SMS. (No trigger channel emits SMS today —
 *                Prisma `enum MessageChannel` is EMAIL | WHATSAPP — so `sendAutomaticSmsMessage` is
 *                provided for a future SMS trigger channel only.)
 *
 * Each helper creates a CommunicationDelivery (origin TRIGGER, status RENDERED) BEFORE any provider
 * call, then advances it to SENT / SKIPPED / FAILED based on the real provider outcome. It NEVER marks
 * SENT without provider acceptance. A `SentMessage` row is written afterwards as a SECONDARY mirror
 * for the legacy dashboard (best-effort, never the source of truth).
 */

export type AutomaticOutcome = "SENT" | "SKIPPED" | "FAILED";
export type AutomaticResult = { outcome: AutomaticOutcome; reason?: string; providerMessageId?: string | null };

type CommonInput = {
  triggerEvent: MessageTriggerEvent;
  templateId: string;
  templateName: string;
  locale: string;
  recipientUserId: string;
  recipientName: string | null;
  /** Rendered variable snapshot (template context). Stored on the delivery + mirror. */
  variables: Record<string, unknown>;
  donationId?: string | null;
  /**
   * Archive purpose for the delivery record. Defaults to TRANSACTIONAL (donation/subscription
   * receipts). Re-engagement events such as DONATION_LAPSED pass MARKETING so consent reporting
   * and provider routing classify them correctly.
   */
  purpose?: CommunicationPurposeId;
};

/** Config/sender/mapping problems → SKIPPED (safe, retryable). Real provider errors → FAILED. */
function isTerminalConfigReason(reason: string): boolean {
  return (
    reason.endsWith("_NOT_CONFIGURED") ||
    reason.endsWith("_NOT_IMPLEMENTED") ||
    reason.includes("SENDER_MISSING") ||
    reason.includes("REQUIRED_FOR_AUTOMATIC") ||
    reason === "TWILIO_LEGACY_DISABLED"
  );
}

/** Build the delivery/mirror variables snapshot, tagging the trigger + donation context. */
function deliveryVariables(input: CommonInput): Record<string, unknown> {
  return { trigger: { event: input.triggerEvent, donationId: input.donationId ?? null }, snapshot: input.variables };
}

/** Secondary SentMessage mirror — written only AFTER the delivery status is known. Best-effort. */
async function mirrorSentMessage(
  channel: "EMAIL" | "WHATSAPP",
  input: CommonInput,
  status: AutomaticOutcome,
  extra: {
    recipientEmail?: string | null;
    recipientPhone?: string | null;
    renderedSubject?: string | null;
    renderedBody: string;
    errorMessage?: string | null;
    providerMessageId?: string | null;
  }
): Promise<void> {
  await logSentMessage({
    channel,
    origin: "TRIGGER",
    status,
    templateId: input.templateId,
    templateName: input.templateName,
    triggerEvent: input.triggerEvent,
    locale: input.locale,
    recipientUserId: input.recipientUserId,
    recipientEmail: extra.recipientEmail ?? null,
    recipientPhone: extra.recipientPhone ?? null,
    recipientName: input.recipientName,
    renderedSubject: extra.renderedSubject ?? null,
    renderedBody: extra.renderedBody,
    variables: input.variables as unknown as Prisma.InputJsonValue,
    errorMessage: extra.errorMessage ?? null,
    providerMessageId: extra.providerMessageId ?? null,
    donationId: input.donationId ?? null,
  });
}

/* ─────────────────────────── EMAIL (Elastic Email) ─────────────────────────── */

export async function sendAutomaticEmailMessage(
  input: CommonInput & {
    recipientEmail: string | null;
    renderedSubject: string;
    renderedBody: string;
    /** Resolved sender identity: enabled EMAIL sender email → ELASTIC_EMAIL_SENDER_EMAIL. */
    senderEmail: string | null;
  }
): Promise<AutomaticResult> {
  const base = {
    channel: "EMAIL" as const,
    provider: EMAIL_PROVIDER_ID,
    origin: "TRIGGER" as const,
    purpose: input.purpose ?? ("TRANSACTIONAL" as const),
    templateId: input.templateId,
    templateName: input.templateName,
    recipientUserId: input.recipientUserId,
    recipientName: input.recipientName,
    locale: input.locale,
    renderedSubject: input.renderedSubject,
    renderedBody: input.renderedBody,
    variables: deliveryVariables(input),
  };

  if (!input.recipientEmail) {
    const created = await createDeliveryRecord({ ...base, recipientEmail: null, status: "RENDERED" });
    if (created.ok) await markDeliveryStatus(created.data.id, "SKIPPED", { errorMessage: "NO_RECIPIENT_EMAIL" });
    await mirrorSentMessage("EMAIL", input, "SKIPPED", { recipientEmail: null, renderedSubject: input.renderedSubject, renderedBody: input.renderedBody, errorMessage: "Recipient has no email address" });
    return { outcome: "SKIPPED", reason: "NO_RECIPIENT_EMAIL" };
  }

  const created = await createDeliveryRecord({ ...base, recipientEmail: input.recipientEmail, status: "RENDERED" });
  if (!created.ok) {
    await mirrorSentMessage("EMAIL", input, "FAILED", { recipientEmail: input.recipientEmail, renderedSubject: input.renderedSubject, renderedBody: input.renderedBody, errorMessage: "ARCHIVE_FAILED" });
    return { outcome: "FAILED", reason: "ARCHIVE_FAILED" };
  }
  const id = created.data.id;

  const res = await sendPreparedDelivery({
    channel: "EMAIL",
    sender: input.senderEmail ? { senderEmail: input.senderEmail } : null,
    to: input.recipientEmail,
    subject: input.renderedSubject,
    html: input.renderedBody,
  });

  if (!res.ok) {
    const terminal = isTerminalConfigReason(res.reason);
    // Store the provider's scrubbed detail with the code. Recording the bare reason cost weeks:
    // every failed row said only "ELASTIC_EMAIL_REJECTED", so nothing on record revealed that the
    // provider was actually answering "Access Denied." The detail is already key-redacted.
    const errorMessage = res.detail ? `${res.reason} — ${res.detail}` : res.reason;
    await markDeliveryStatus(id, terminal ? "SKIPPED" : "FAILED", { errorMessage });
    await mirrorSentMessage("EMAIL", input, terminal ? "SKIPPED" : "FAILED", { recipientEmail: input.recipientEmail, renderedSubject: input.renderedSubject, renderedBody: input.renderedBody, errorMessage });
    return { outcome: terminal ? "SKIPPED" : "FAILED", reason: res.reason };
  }

  await markDeliveryStatus(id, "SENT", { providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted });
  await mirrorSentMessage("EMAIL", input, "SENT", { recipientEmail: input.recipientEmail, renderedSubject: input.renderedSubject, renderedBody: input.renderedBody, providerMessageId: res.providerMessageId });
  return { outcome: "SENT", providerMessageId: res.providerMessageId };
}

/* ───────────────────────── WHATSAPP (Meta Cloud API) ───────────────────────── */

export async function sendAutomaticWhatsappMessage(
  input: CommonInput & {
    recipientPhone: string | null;
    renderedBody: string;
    /** Meta-approved template mapping, or null when the stored template can't be sent through Meta. */
    metaTemplate: { name: string; language: string } | null;
    /** Resolved Meta sender (must have a phoneNumberId to actually send). */
    sender: { id?: string | null; phoneNumberId: string | null } | null;
  }
): Promise<AutomaticResult> {
  const base = {
    channel: "WHATSAPP" as const,
    provider: "META_WHATSAPP" as const,
    origin: "TRIGGER" as const,
    purpose: input.purpose ?? ("TRANSACTIONAL" as const),
    templateId: input.templateId,
    templateName: input.templateName,
    recipientUserId: input.recipientUserId,
    recipientName: input.recipientName,
    locale: input.locale,
    renderedBody: input.renderedBody,
    variables: deliveryVariables(input),
    senderId: input.sender?.id ?? null,
  };

  if (!input.recipientPhone) {
    const created = await createDeliveryRecord({ ...base, recipientPhone: null, status: "RENDERED" });
    if (created.ok) await markDeliveryStatus(created.data.id, "SKIPPED", { errorMessage: "NO_RECIPIENT_PHONE" });
    await mirrorSentMessage("WHATSAPP", input, "SKIPPED", { recipientPhone: null, renderedBody: input.renderedBody, errorMessage: "Recipient has no phone number" });
    return { outcome: "SKIPPED", reason: "NO_RECIPIENT_PHONE" };
  }

  // Meta does not allow arbitrary free-text outbound — an approved template mapping is required.
  if (!input.metaTemplate) {
    const created = await createDeliveryRecord({ ...base, recipientPhone: input.recipientPhone, status: "RENDERED" });
    if (created.ok) await markDeliveryStatus(created.data.id, "SKIPPED", { errorMessage: "META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP" });
    await mirrorSentMessage("WHATSAPP", input, "SKIPPED", { recipientPhone: input.recipientPhone, renderedBody: input.renderedBody, errorMessage: "META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP" });
    return { outcome: "SKIPPED", reason: "META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP" };
  }

  const created = await createDeliveryRecord({ ...base, recipientPhone: input.recipientPhone, status: "RENDERED" });
  if (!created.ok) {
    await mirrorSentMessage("WHATSAPP", input, "FAILED", { recipientPhone: input.recipientPhone, renderedBody: input.renderedBody, errorMessage: "ARCHIVE_FAILED" });
    return { outcome: "FAILED", reason: "ARCHIVE_FAILED" };
  }
  const id = created.data.id;

  if (!input.sender?.phoneNumberId) {
    await markDeliveryStatus(id, "SKIPPED", { errorMessage: "META_SENDER_MISSING_PHONE_NUMBER_ID" });
    await mirrorSentMessage("WHATSAPP", input, "SKIPPED", { recipientPhone: input.recipientPhone, renderedBody: input.renderedBody, errorMessage: "META_SENDER_MISSING_PHONE_NUMBER_ID" });
    return { outcome: "SKIPPED", reason: "META_SENDER_MISSING_PHONE_NUMBER_ID" };
  }

  const res = await sendPreparedDelivery({
    channel: "WHATSAPP",
    sender: { provider: "META_WHATSAPP", phoneNumberId: input.sender.phoneNumberId },
    to: input.recipientPhone,
    templateName: input.metaTemplate.name,
    languageCode: input.metaTemplate.language,
  });

  if (!res.ok) {
    const terminal = isTerminalConfigReason(res.reason);
    await markDeliveryStatus(id, terminal ? "SKIPPED" : "FAILED", { errorMessage: res.reason });
    await mirrorSentMessage("WHATSAPP", input, terminal ? "SKIPPED" : "FAILED", { recipientPhone: input.recipientPhone, renderedBody: input.renderedBody, errorMessage: res.reason });
    return { outcome: terminal ? "SKIPPED" : "FAILED", reason: res.reason };
  }

  await markDeliveryStatus(id, "SENT", { providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted });
  await mirrorSentMessage("WHATSAPP", input, "SENT", { recipientPhone: input.recipientPhone, renderedBody: input.renderedBody, providerMessageId: res.providerMessageId });
  return { outcome: "SENT", providerMessageId: res.providerMessageId };
}

/* ─────────────────────────── SMS (Netgsm TR / Brevo) ─────────────────────────── */

/**
 * Automatic SMS. NOTE: no trigger channel currently emits SMS (Prisma `enum MessageChannel` is
 * EMAIL | WHATSAPP), so this is not reached from `dispatchEvent` today. It is provided so a future
 * SMS trigger channel routes correctly (TR → Netgsm, international → Brevo SMS) with a
 * CommunicationDelivery record and no Twilio. No SentMessage mirror (that enum has no SMS value).
 */
export async function sendAutomaticSmsMessage(
  input: CommonInput & {
    recipientPhone: string | null;
    country?: string | null;
    renderedBody: string;
    smsSender?: string | null;
  }
): Promise<AutomaticResult> {
  const base = {
    channel: "SMS" as const,
    origin: "TRIGGER" as const,
    purpose: "TRANSACTIONAL" as const,
    templateId: input.templateId,
    templateName: input.templateName,
    recipientUserId: input.recipientUserId,
    recipientName: input.recipientName,
    locale: input.locale,
    renderedBody: input.renderedBody,
    variables: deliveryVariables(input),
  };

  if (!input.recipientPhone) {
    const created = await createDeliveryRecord({ ...base, recipientPhone: null, status: "RENDERED" });
    if (created.ok) await markDeliveryStatus(created.data.id, "SKIPPED", { errorMessage: "NO_RECIPIENT_PHONE" });
    return { outcome: "SKIPPED", reason: "NO_RECIPIENT_PHONE" };
  }

  const created = await createDeliveryRecord({ ...base, recipientPhone: input.recipientPhone, status: "RENDERED" });
  if (!created.ok) return { outcome: "FAILED", reason: "ARCHIVE_FAILED" };
  const id = created.data.id;

  const res = await sendPreparedDelivery({
    channel: "SMS",
    sender: input.smsSender ? { smsSender: input.smsSender } : null,
    country: input.country,
    to: input.recipientPhone,
    html: input.renderedBody,
  });

  if (!res.ok) {
    const terminal = isTerminalConfigReason(res.reason);
    await markDeliveryStatus(id, terminal ? "SKIPPED" : "FAILED", { errorMessage: res.reason });
    return { outcome: terminal ? "SKIPPED" : "FAILED", reason: res.reason };
  }

  await markDeliveryStatus(id, "SENT", { providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted });
  return { outcome: "SENT", providerMessageId: res.providerMessageId };
}

/**
 * Resolve a Meta-approved template mapping from a stored WhatsappTemplate. Returns null unless the
 * template is genuinely a Meta template (provider META/META_WHATSAPP, approved, with a name+language).
 * Twilio-imported and MANUAL free-text templates return null → automatic WhatsApp is SKIPPED.
 */
export function resolveMetaTemplateMapping(
  tpl: { provider?: string | null; approvalStatus?: string | null; language?: string | null; externalTemplateId?: string | null; name?: string | null },
  locale: string
): { name: string; language: string } | null {
  const provider = (tpl.provider ?? "").toUpperCase();
  const approved = (tpl.approvalStatus ?? "").toLowerCase() === "approved";
  if (provider !== "META" && provider !== "META_WHATSAPP") return null;
  if (!approved) return null;
  // A Meta template is identified by its registered name; prefer the explicit external id, else name.
  const name = (tpl.externalTemplateId ?? tpl.name ?? "").trim();
  if (!name) return null;
  return { name, language: (tpl.language ?? locale).trim() || locale };
}
