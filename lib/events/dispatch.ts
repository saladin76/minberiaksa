import { prisma } from "@/lib/prisma";
import { track as vercelTrack } from "@vercel/analytics/server";
import { loadContext, loadContextForDonation, mergeText, type TemplateContext } from "@/lib/templates/variables";
import { renderEmailHtml, renderEmailSubject } from "@/lib/templates/render";
import { writeAuditLog } from "@/lib/audit-log";
import { triggerEventLabelAr } from "@/lib/dashboard/audit-log-display";
import { pickLocale, resolveEmailVariant, resolveWhatsappBody } from "@/lib/templates/locale-resolver";
import type { TReaderDocument } from "@usewaypoint/email-builder";
import { notifyDonationEvent } from "@/lib/telegram/notify";
import { sendDonationServerConversions } from "@/lib/tracking/donation-conversion-server";
import { upsertProfileForUser } from "@/lib/communication/donor-communication-profile-service";
import { sendAutomaticEmailMessage, sendAutomaticWhatsappMessage, resolveMetaTemplateMapping, type AutomaticOutcome } from "@/lib/communication/automatic-message-dispatcher";
import { listSenders } from "@/lib/communication/sender-service";
import { getActiveCommunicationRuntimeBundle } from "@/lib/communication/runtime-config";
import type { CommunicationPurposeId } from "@/lib/communication/communication-runtime-types";
import type { SupportedLocale } from "@/lib/locales";

export type MessageTriggerEvent = "DONATION_PAID" | "DONATION_FAILED" | "FIRST_DONATION" | "USER_REGISTERED" | "SUBSCRIPTION_CREATED" | "SUBSCRIPTION_PAYMENT" | "SUBSCRIPTION_CANCELLED" | "DONATION_LAPSED";
export interface EventDispatchInput { userId?: string; donationId?: string }
interface DispatchResult { triggers: number; emailsSent: number; whatsappSent: number; errors: number }

/** Resolved sender identities shared by every send in one dispatch/batch run. */
export interface TriggerSendConfig {
  emailIdentity: string | null;
  whatsappSender: { id: string | null; phoneNumberId: string | null } | null;
}

/**
 * Resolve the email/WhatsApp sender identities once. Batch senders (the DONATION_LAPSED cron)
 * resolve this a single time and reuse it across hundreds of recipients.
 */
export async function resolveTriggerSendConfig(): Promise<TriggerSendConfig> {
  const [senders, runtime] = await Promise.all([listSenders().catch(() => []), getActiveCommunicationRuntimeBundle()]);
  const emailSenderRow = senders.find((sender) => sender.channel === "EMAIL" && sender.enabled)?.senderEmail ?? null;
  const emailIdentity = emailSenderRow || (runtime.elasticEmail.configured ? runtime.elasticEmail.values.senderEmail : null);
  const metaSenderRow = senders.find((sender) => sender.channel === "WHATSAPP" && sender.enabled && sender.phoneNumberId);
  const whatsappSender = metaSenderRow
    ? { id: metaSenderRow.id, phoneNumberId: metaSenderRow.phoneNumberId }
    : runtime.meta.configured
      ? { id: null, phoneNumberId: runtime.meta.values.defaultPhoneNumberId }
      : null;
  return { emailIdentity, whatsappSender };
}

export type TriggerSendOutcome = { channel: "EMAIL" | "WHATSAPP"; outcome: AutomaticOutcome; reason?: string };

/**
 * Render one trigger's template for one recipient and hand it to the provider layer.
 * Returns null when the referenced template no longer exists (deleted behind the trigger).
 */
export async function sendTriggerMessage(
  trigger: { channel: string; templateId: string },
  ctx: TemplateContext,
  opts: { event: MessageTriggerEvent; locale: SupportedLocale; config: TriggerSendConfig; donationId?: string | null; purpose?: CommunicationPurposeId }
): Promise<TriggerSendOutcome | null> {
  const { event, locale, config } = opts;
  const variables = ctx as unknown as Record<string, unknown>;
  const donationId = opts.donationId ?? null;

  if (trigger.channel === "EMAIL") {
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: trigger.templateId } });
    if (!tpl) return null;
    const variant = resolveEmailVariant(tpl, locale);
    const html = await renderEmailHtml(variant.document as TReaderDocument, ctx);
    const subject = renderEmailSubject(variant.subject, ctx);
    const response = await sendAutomaticEmailMessage({ triggerEvent: event, templateId: tpl.id, templateName: tpl.name, locale, recipientUserId: ctx.user.id, recipientName: ctx.user.name || null, recipientEmail: ctx.user.email ?? null, renderedSubject: subject, renderedBody: html, senderEmail: config.emailIdentity, variables, donationId, purpose: opts.purpose });
    return { channel: "EMAIL", outcome: response.outcome, reason: response.reason };
  }

  if (trigger.channel === "WHATSAPP") {
    const tpl = await prisma.whatsappTemplate.findUnique({ where: { id: trigger.templateId } });
    if (!tpl) return null;
    const variant = resolveWhatsappBody(tpl, locale);
    const body = mergeText(variant.body, ctx);
    const response = await sendAutomaticWhatsappMessage({ triggerEvent: event, templateId: tpl.id, templateName: tpl.name, locale, recipientUserId: ctx.user.id, recipientName: ctx.user.name || null, recipientPhone: ctx.user.phone ?? null, renderedBody: body, metaTemplate: resolveMetaTemplateMapping(tpl, locale), sender: config.whatsappSender, variables, donationId, purpose: opts.purpose });
    return { channel: "WHATSAPP", outcome: response.outcome, reason: response.reason };
  }

  return null;
}

export async function dispatchEvent(event: MessageTriggerEvent, input: EventDispatchInput): Promise<DispatchResult> {
  const result: DispatchResult = { triggers: 0, emailsSent: 0, whatsappSent: 0, errors: 0 };
  if (input.donationId && (event === "DONATION_PAID" || event === "DONATION_FAILED" || event === "FIRST_DONATION")) void notifyDonationEvent(event, input.donationId);
  try {
    const triggers = await prisma.messageTrigger.findMany({ where: { event, enabled: true } });
    result.triggers = triggers.length;
    if (!triggers.length) return result;
    const ctx: TemplateContext | null = input.donationId ? await loadContextForDonation(input.donationId) : input.userId ? await loadContext(input.userId) : null;
    if (!ctx) {
      await writeAuditLog({ actorRole: "SYSTEM", action: "EVENT_DISPATCH_NO_CONTEXT", messageAr: `تعذّر إرسال الرسائل التلقائية عند «${triggerEventLabelAr(event)}» — بيانات المستلم غير متاحة`, metadata: { event, ...input }, stream: "TEAM" });
      return result;
    }
    const locale = pickLocale({ recipientLang: ctx.user.preferredLang });
    const config = await resolveTriggerSendConfig();

    for (const trigger of triggers) {
      try {
        const sent = await sendTriggerMessage(trigger, ctx, { event, locale, config, donationId: input.donationId ?? null });
        if (!sent) continue;
        if (sent.outcome === "SENT") {
          if (sent.channel === "EMAIL") result.emailsSent += 1;
          else result.whatsappSent += 1;
        } else if (sent.outcome === "FAILED") {
          result.errors += 1;
        }
      } catch {
        result.errors += 1;
      }
    }
    // Only record a dispatch that actually did something. A trigger that matched
    // no recipient produced «حدث تلقائي DONATION_FAILED — 0 بريد، 0 واتساب»,
    // which says nothing and drowned the rows that do.
    const didSomething = result.emailsSent > 0 || result.whatsappSent > 0 || result.errors > 0;
    if (didSomething) {
      const parts = [
        result.emailsSent ? `${result.emailsSent} بريد` : null,
        result.whatsappSent ? `${result.whatsappSent} واتساب` : null,
        result.errors ? `${result.errors} فشل` : null,
      ].filter(Boolean);
      await writeAuditLog({
        actorRole: "SYSTEM",
        action: "EVENT_DISPATCH",
        // The raw enum key used to leak into the message; label it instead.
        messageAr: `رسائل تلقائية عند «${triggerEventLabelAr(event)}» — ${parts.join("، ")}`,
        metadata: { event, ...input, ...result },
        stream: "TEAM",
      });
    }
  } catch {
    result.errors += 1;
  }
  return result;
}

export async function dispatchDonationPaid(donationId: string): Promise<void> {
  await dispatchEvent("DONATION_PAID", { donationId });
  try {
    const capi = await sendDonationServerConversions(donationId);
    if (!capi.ok && !capi.skipped) console.error("dispatchDonationPaid CAPI returned not-ok", { donationId, reason: capi.reason ?? capi.error ?? null });
  } catch { console.error("dispatchDonationPaid CAPI failed", { donationId }); }
  try {
    const donation = await prisma.donation.findUnique({ where: { id: donationId }, select: { donorId: true, amount: true, amountUSD: true, currency: true, subscriptionId: true, paymentMethod: true, provider: true, locale: true } });
    if (!donation) return;
    try { await upsertProfileForUser(donation.donorId, { donationLocale: donation.locale }); } catch { console.error("dispatchDonationPaid profile sync failed", { donationId }); }
    const paidCount = await prisma.donation.count({ where: { donorId: donation.donorId, status: "PAID" } });
    if (paidCount === 1) await dispatchEvent("FIRST_DONATION", { donationId });
    try {
      await vercelTrack("donation_paid_server", { donation_id: donationId, amount: donation.amount ?? 0, amount_usd: donation.amountUSD ?? donation.amount ?? 0, currency: donation.currency ?? "USD", donation_type: donation.subscriptionId ? "SUBSCRIPTION" : "ONE_TIME", payment_method: donation.paymentMethod ?? null, gateway: donation.provider ?? null, is_first_donation: paidCount === 1 });
    } catch { console.error("Vercel donation_paid_server track failed"); }
  } catch { console.error("dispatchDonationPaid first-donation check failed", { donationId }); }
}
