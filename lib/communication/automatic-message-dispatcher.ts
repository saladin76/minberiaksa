import type { Prisma, MessageTriggerEvent } from "@prisma/client";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { sendPreparedDelivery } from "./provider-router";
import { EMAIL_PROVIDER_ID } from "./providers/email/client";
import { logSentMessage } from "@/lib/messaging/log-sent";
import type { CommunicationPurposeId } from "./communication-runtime-types";
import { getActiveMetaWhatsappRuntimeConfig } from "./runtime-config";

/**
 * Automatic (trigger-fired) message dispatcher for the Communication Center.
 *
 * Every automatic donation/subscription message now flows through the FINAL provider architecture:
 *   - EMAIL    → Elastic Email (via ProviderRouter). Never SendGrid, never Brevo.
 *   - WHATSAPP → Meta Cloud API. Utility/Auth prefers Direct Send when the beta is enabled, then
 *                falls back to an approved Meta template. Marketing stays template-only. Never Twilio.
 *   - SMS      → TR (+90) → Netgsm, international → Brevo SMS. (No trigger channel emits SMS today 
 *                Prisma `enum MessageChannel` is EMAIL | WHATSAPP  so `sendAutomaticSmsMessage` is
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
    reason === "EMAIL_SUPPRESSED" ||
    reason.includes("SENDER_MISSING") ||
    reason.includes("REQUIRED_FOR_AUTOMATIC") ||
    reason === "TWILIO_LEGACY_DISABLED"
  );
}

/** Build the delivery/mirror variables snapshot, tagging the trigger + donation context. */
function deliveryVariables(input: CommonInput): Record<string, unknown> {
  return { trigger: { event: input.triggerEvent, donationId: input.donationId ?? null }, snapshot: input.variables };
}

/** Secondary SentMessage mirror  written only AFTER the delivery status is known. Best-effort. */
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
    /** PDFs generated for this event (the confirmation email's certificate and receipt). */
    attachments?: Array<{ filename: string; content: string; contentType: string }>;
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
    purpose: input.purpose ?? "TRANSACTIONAL",
    locale: input.locale,
    channelName: `trigger:${input.triggerEvent}`,
    attachments: input.attachments,
  });

  if (!res.ok) {
    const terminal = isTerminalConfigReason(res.reason);
    // Store the provider's scrubbed detail with the code. Recording the bare reason cost weeks:
    // every failed row said only "ELASTIC_EMAIL_REJECTED", so nothing on record revealed that the
    // provider was actually answering "Access Denied." The detail is already key-redacted.
    const errorMessage = res.detail ? `${res.reason}  ${res.detail}` : res.reason;
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
    metaTemplate: MetaTemplateMapping | null;
    /** Values for the template's placeholders, keyed by variable name and/or position. */
    templateValues?: Record<string, string | null | undefined>;
    /** Asset URL for a template whose Meta header is IMAGE/VIDEO/DOCUMENT. */
    headerMediaUrl?: string | null;
    /** Resolved Meta sender (must have a phoneNumberId to actually send). */
    sender: { id?: string | null; phoneNumberId: string | null; businessAccountId?: string | null } | null;
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

  /*
   * Hybrid automatic WhatsApp:
   *   1) Direct Send for Utility/Auth when the beta is enabled for the account.
   *   2) Approved Meta template as a deterministic fallback.
   *
   * Transactional donation/account notices map to Direct Send's Utility category. Marketing is
   * never allowed here. A Direct Send rejection does NOT lose the notification: if a matching
   * approved template exists, the exact same event falls back to it.
   */
  const directCategory =
    input.purpose === "AUTHENTICATION"
      ? "authentication"
      : input.purpose === "UTILITY" || input.purpose === "TRANSACTIONAL"
        ? "utility"
        : null;
  if (directCategory && process.env.META_WHATSAPP_DIRECT_SEND_ENABLED === "true") {
    const runtime = await getActiveMetaWhatsappRuntimeConfig();
    const { sendDirectTextMessage } = await import("./providers/meta-whatsapp/messages");
    const direct = await sendDirectTextMessage(
      {
        phoneNumberId: input.sender.phoneNumberId,
        to: input.recipientPhone,
        body: input.renderedBody,
        category: directCategory,
      },
      runtime,
    );
    if (direct.ok) {
      await markDeliveryStatus(id, "SENT", { providerMessageId: direct.providerMessageId });
      await mirrorSentMessage("WHATSAPP", input, "SENT", {
        recipientPhone: input.recipientPhone,
        renderedBody: input.renderedBody,
        providerMessageId: direct.providerMessageId,
      });
      return { outcome: "SENT", providerMessageId: direct.providerMessageId };
    }
    // Keep going to the approved-template fallback below. The final delivery row records only the
    // terminal result so reporting stays one row per automatic event.
  }

  if (input.metaTemplate && directCategory) {
    const actualCategory = String(input.metaTemplate.category ?? "").toUpperCase();
    const expectedCategory = directCategory === "authentication" ? "AUTHENTICATION" : "UTILITY";
    if (actualCategory && actualCategory !== expectedCategory) {
      await markDeliveryStatus(id, "SKIPPED", { errorMessage: `META_TEMPLATE_CATEGORY_MISMATCH:${actualCategory}` });
      await mirrorSentMessage("WHATSAPP", input, "SKIPPED", {
        recipientPhone: input.recipientPhone,
        renderedBody: input.renderedBody,
        errorMessage: `META_TEMPLATE_CATEGORY_MISMATCH:${actualCategory}`,
      });
      return { outcome: "SKIPPED", reason: "META_TEMPLATE_CATEGORY_MISMATCH" };
    }
  }

  if (!input.metaTemplate) {
    await markDeliveryStatus(id, "SKIPPED", { errorMessage: "META_DIRECT_SEND_OR_TEMPLATE_REQUIRED" });
    await mirrorSentMessage("WHATSAPP", input, "SKIPPED", {
      recipientPhone: input.recipientPhone,
      renderedBody: input.renderedBody,
      errorMessage: "META_DIRECT_SEND_OR_TEMPLATE_REQUIRED",
    });
    return { outcome: "SKIPPED", reason: "META_DIRECT_SEND_OR_TEMPLATE_REQUIRED" };
  }

  /* Meta counts parameters against the schema it approved, so the components are built from that
     schema rather than from the local body text. A template asking for a value we cannot supply is
     skipped here instead of being sent and rejected with `#132000`. */
  const { buildMetaComponents } = await import("./providers/meta-whatsapp/parameters");
  const built = buildMetaComponents({
    componentsSchema: input.metaTemplate.componentsSchema,
    values: input.templateValues ?? {},
    positionalNames: input.metaTemplate.positionalNames,
    scopedNames: input.metaTemplate.scopedNames,
    headerMediaUrl: input.headerMediaUrl ?? input.metaTemplate.headerMediaUrl ?? null,
    headerMediaFilename: input.metaTemplate.headerMediaFilename,
    headerLocation: input.metaTemplate.headerLocation,
  });
  if (!built.ok) {
    await markDeliveryStatus(id, "SKIPPED", { errorMessage: built.reason });
    await mirrorSentMessage("WHATSAPP", input, "SKIPPED", { recipientPhone: input.recipientPhone, renderedBody: input.renderedBody, errorMessage: `${built.reason}: ${built.detail}` });
    return { outcome: "SKIPPED", reason: built.reason };
  }

  const res = await sendPreparedDelivery({
    channel: "WHATSAPP",
    sender: { provider: "META_WHATSAPP", phoneNumberId: input.sender.phoneNumberId },
    to: input.recipientPhone,
    templateName: input.metaTemplate.name,
    /* The variant's OWN language, never the recipient's locale. */
    languageCode: input.metaTemplate.language,
    components: built.components,
  });

  if (!res.ok) {
    const terminal = isTerminalConfigReason(res.reason);
    const errorMessage = res.detail ? `${res.reason}  ${res.detail}` : res.reason;
    await markDeliveryStatus(id, terminal ? "SKIPPED" : "FAILED", { errorMessage });
    await mirrorSentMessage("WHATSAPP", input, terminal ? "SKIPPED" : "FAILED", {
      recipientPhone: input.recipientPhone,
      renderedBody: input.renderedBody,
      errorMessage,
    });
    return { outcome: terminal ? "SKIPPED" : "FAILED", reason: res.reason };
  }

  const persisted = await markDeliveryStatus(id, "SENT", { providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted });
  if (!persisted.ok) {
    console.error("Meta accepted WhatsApp trigger send but delivery status persistence failed", {
      deliveryId: id,
      providerMessageId: res.providerMessageId,
      error: persisted.error,
    });
  }
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
    purpose: input.purpose ?? ("TRANSACTIONAL" as const),
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
    purpose: input.purpose ?? "TRANSACTIONAL",
  });

  if (!res.ok) {
    const terminal = isTerminalConfigReason(res.reason);
    await markDeliveryStatus(id, terminal ? "SKIPPED" : "FAILED", { errorMessage: res.reason });
    return { outcome: terminal ? "SKIPPED" : "FAILED", reason: res.reason };
  }

  await markDeliveryStatus(id, "SENT", { providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted });
  return { outcome: "SENT", providerMessageId: res.providerMessageId };
}

export type MetaTemplateMapping = {
  name: string;
  /** Meta's actual category for the selected provider variant. */
  category: string | null;
  /** `{{1}}`, `{{2}}` … in order, from the local template's variable catalog. */
  positionalNames: string[];
  /** Semantic name by component-scoped position (header.1, body.1, button.0.1). */
  scopedNames: Record<string, string>;
  headerMediaUrl: string | null;
  headerMediaFilename: string | null;
  headerLocation: { latitude: number; longitude: number; name?: string; address?: string } | null;
  /** The language code of the variant actually chosen  NOT the recipient's locale. */
  language: string;
  /** Meta's own component schema for that variant, for building parameters. */
  componentsSchema: unknown;
  /** The locale the chosen variant serves, when it maps to one of ours. */
  resolvedLocale: string | null;
};

/**
 * Resolve the Meta template mapping for one recipient locale  from what Meta said, per language.
 *
 * Two things were wrong before. The template's approval was read off the local row
 * (`provider`/`approvalStatus`/`externalTemplateId` typed in by hand), so the platform believed
 * its own bookkeeping instead of the provider: a template Meta had rejected, or never received, was
 * "approved" here until a send failed. And the language sent to Meta was `tpl.language ?? locale`
 *  the recipient's locale. A French donor with only an Arabic variant approved therefore got a
 * request for `fr`, which Meta rejects outright (`#132001`); the message was lost even though a
 * perfectly good Arabic variant existed. The language now comes from the variant that was chosen,
 * which is the only language that variant can be sent in.
 *
 * Returns null when nothing is sendable  a free-text MANUAL template, a Twilio import, a template
 * whose variants Meta has not approved, or one the sync has never seen. Automatic WhatsApp is then
 * SKIPPED, which is the honest outcome: Meta refuses business-initiated free text, so there is no
 * legal payload to fall back to.
 */
export async function resolveMetaTemplateMapping(
  tpl: { id?: string | null; provider?: string | null; name?: string | null; variables?: unknown; header?: unknown },
  locale: string,
  businessAccountId?: string | null,
): Promise<MetaTemplateMapping | null> {
  const provider = (tpl.provider ?? "").toUpperCase();
  if (provider !== "META" && provider !== "META_WHATSAPP") return null;
  if (!tpl.id) return null;
  const { getTemplateReadiness } = await import("./whatsapp-template-sync");
  const readiness = await getTemplateReadiness(tpl.id, locale, businessAccountId);
  if (!readiness.ready || !readiness.providerTemplateName || !readiness.languageCode) return null;
  const binding = variableBindingInfo(tpl.variables);
  const header = tpl.header && typeof tpl.header === "object" ? tpl.header as Record<string, unknown> : {};
  const latitude = Number(header.latitude);
  const longitude = Number(header.longitude);
  return {
    name: readiness.providerTemplateName,
    category: readiness.category ? String(readiness.category).toUpperCase() : null,
    positionalNames: binding.names,
    scopedNames: binding.scopedNames,
    headerMediaUrl: typeof header.mediaUrl === "string" && header.mediaUrl.trim() ? header.mediaUrl.trim() : null,
    headerMediaFilename: typeof header.fileName === "string" && header.fileName.trim() ? header.fileName.trim() : null,
    headerLocation: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? {
          latitude,
          longitude,
          ...(typeof header.name === "string" && header.name.trim() ? { name: header.name.trim() } : {}),
          ...(typeof header.address === "string" && header.address.trim() ? { address: header.address.trim() } : {}),
        }
      : null,
    language: readiness.languageCode,
    componentsSchema: readiness.componentsSchema,
    resolvedLocale: readiness.locale,
  };
}

/** The local `variables` catalog is `Array<{ key, … }>`, already in placeholder order. */
function variableBindingInfo(variables: unknown): { names: string[]; scopedNames: Record<string, string> } {
  if (!Array.isArray(variables)) return { names: [], scopedNames: {} };
  const names: string[] = [];
  const scopedNames: Record<string, string> = {};
  for (const entry of variables) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { key?: unknown; scope?: unknown; position?: unknown };
    const key = String(row.key ?? "");
    if (!key) continue;
    if (!names.includes(key)) names.push(key);
    const scope = typeof row.scope === "string" ? row.scope : null;
    const position = Number(row.position);
    if (scope && Number.isFinite(position) && position > 0) scopedNames[`${scope}.${position}`] = key;
  }
  return { names, scopedNames };
}
