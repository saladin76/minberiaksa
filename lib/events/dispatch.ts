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
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot, type SenderResolution, type SenderRoutingSnapshot } from "@/lib/communication/sender-resolution";
import type { CommunicationPurposeId } from "@/lib/communication/communication-runtime-types";
import type { SupportedLocale } from "@/lib/locales";
import { donationAttachments, type EmailAttachment } from "@/lib/certificates/generate";
import { ensureDonationDocuments } from "@/lib/certificates/issue";
import { getServerBaseUrl } from "@/lib/server-base-url";

export type MessageTriggerEvent = "DONATION_PAID" | "DONATION_FAILED" | "FIRST_DONATION" | "USER_REGISTERED" | "SUBSCRIPTION_CREATED" | "SUBSCRIPTION_PAYMENT" | "SUBSCRIPTION_CANCELLED" | "DONATION_LAPSED";
export interface EventDispatchInput { userId?: string; donationId?: string }
interface DispatchResult { triggers: number; emailsSent: number; whatsappSent: number; skipped: number; errors: number; skipReasons: Record<string, number> }

/**
 * The sender tables and routing rules for one dispatch/batch run.
 *
 * This used to be a single resolved identity, picked before any recipient was known: the first
 * enabled WhatsApp sender with a phone number, and the first enabled email sender. Every donor in a
 * batch therefore got the same number regardless of their locale or country, while a campaign to
 * those same donors routed properly  so one donor could hold two WhatsApp threads with the
 * organisation, one per code path. The snapshot is read once, as before, but the DECISION is now
 * made per recipient by `lib/communication/sender-resolution.ts`, the one resolver every outbound
 * path shares.
 */
export interface TriggerSendConfig {
  email: SenderRoutingSnapshot;
  whatsapp: SenderRoutingSnapshot;
}

/** Read the sender tables once. Batch senders reuse this across hundreds of recipients. */
export async function resolveTriggerSendConfig(): Promise<TriggerSendConfig> {
  const [email, whatsapp] = await Promise.all([
    loadSenderRoutingSnapshot("EMAIL"),
    loadSenderRoutingSnapshot("WHATSAPP"),
  ]);
  return { email, whatsapp };
}

/** The per-recipient decision: the recipient's locale and country, and this message's purpose. */
export function resolveTriggerSender(
  config: TriggerSendConfig,
  channel: "EMAIL" | "WHATSAPP",
  request: { locale?: string | null; country?: string | null; purpose?: CommunicationPurposeId },
): SenderResolution {
  return resolveSenderFromSnapshot(channel === "EMAIL" ? config.email : config.whatsapp, {
    locale: request.locale ?? null,
    country: request.country ?? null,
    purpose: request.purpose ?? "TRANSACTIONAL",
  });
}

export type TriggerSendOutcome = { channel: "EMAIL" | "WHATSAPP"; outcome: AutomaticOutcome; reason?: string };

/**
 * Render one trigger's template for one recipient and hand it to the provider layer.
 * Returns null when the referenced template no longer exists (deleted behind the trigger).
 */
export async function sendTriggerMessage(
  trigger: { channel: string; templateId: string },
  ctx: TemplateContext,
  opts: { event: MessageTriggerEvent; locale: SupportedLocale; config: TriggerSendConfig; donationId?: string | null; purpose?: CommunicationPurposeId; attachments?: EmailAttachment[] }
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
    const routed = resolveTriggerSender(config, "EMAIL", { locale, purpose: opts.purpose });
    /* A routing refusal is the answer, not a prompt to fall back to the default identity. */
    if (!routed.ok) return { channel: "EMAIL", outcome: "SKIPPED", reason: routed.reason };
    const response = await sendAutomaticEmailMessage({ triggerEvent: event, templateId: tpl.id, templateName: tpl.name, locale, recipientUserId: ctx.user.id, recipientName: ctx.user.name || null, recipientEmail: ctx.user.email ?? null, renderedSubject: subject, renderedBody: html, senderEmail: routed.sender.senderEmail, variables, donationId, purpose: opts.purpose, attachments: opts.attachments });
    return { channel: "EMAIL", outcome: response.outcome, reason: response.reason };
  }

  if (trigger.channel === "WHATSAPP") {
    const tpl = await prisma.whatsappTemplate.findUnique({ where: { id: trigger.templateId } });
    if (!tpl) return null;
    const variant = resolveWhatsappBody(tpl, locale);
    const body = mergeText(variant.body, ctx);
    const routed = resolveTriggerSender(config, "WHATSAPP", { locale, purpose: opts.purpose });
    if (!routed.ok) return { channel: "WHATSAPP", outcome: "SKIPPED", reason: routed.reason };
    const metaTemplate = await resolveMetaTemplateMapping(tpl, locale, routed.sender.businessAccountId);
    /* Meta's placeholders are positional, and the local template's variable catalog says which
       token each position carries. Each one is rendered against this recipient's context through
       the same merge the body uses, so the parameters and the body cannot disagree. */
    const templateValues: Record<string, string> = {};
    (metaTemplate?.positionalNames ?? []).forEach((name, index) => {
      const value = mergeText(`{{${name}}}`, ctx);
      templateValues[name] = value;
      templateValues[String(index + 1)] = value;
    });
    const response = await sendAutomaticWhatsappMessage({ triggerEvent: event, templateId: tpl.id, templateName: tpl.name, locale, recipientUserId: ctx.user.id, recipientName: ctx.user.name || null, recipientPhone: ctx.user.phone ?? null, renderedBody: body, metaTemplate, templateValues, sender: { id: routed.sender.id, phoneNumberId: routed.sender.phoneNumberId, businessAccountId: routed.sender.businessAccountId }, variables, donationId, purpose: opts.purpose });
    return { channel: "WHATSAPP", outcome: response.outcome, reason: response.reason };
  }

  return null;
}

/** Donation-scoped events that must reach the donor once per donation, however many times
 * the payment is confirmed (replayed webhook, reconciliation job, gateway callback retry). */
const ONCE_PER_DONATION: ReadonlySet<MessageTriggerEvent> = new Set([
  "DONATION_PAID",
  "FIRST_DONATION",
  "DONATION_FAILED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_PAYMENT",
]);

export function dispatchClaimKey(event: MessageTriggerEvent, donationId: string): string {
  return `${event}:${donationId}`;
}

/**
 * Recoverable once-per-donation claim.
 *
 * A plain permanent insert prevented duplicates, but it also turned a serverless crash into a
 * permanent lost notification: the claim could be committed and the function terminated before
 * WhatsApp/email was sent. Claims are now short leases. A completed dispatch stays deduplicated;
 * an interrupted dispatch can be reclaimed after the lease expires.
 */
const DISPATCH_CLAIM_LEASE_MS = 10 * 60 * 1000;
type DispatchClaim = { acquired: boolean; token: string | null };

async function claimDispatch(event: MessageTriggerEvent, donationId: string): Promise<DispatchClaim> {
  const isDuplicate = (value: unknown) => /E11000|duplicate key/i.test(String(value));
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + DISPATCH_CLAIM_LEASE_MS);
  const key = dispatchClaimKey(event, donationId);

  try {
    const inserted = (await prisma.$runCommandRaw({
      insert: "EventDispatchClaim",
      documents: [{
        _id: key,
        event,
        donationId,
        state: "IN_PROGRESS",
        token,
        createdAt: { $date: now.toISOString() },
        updatedAt: { $date: now.toISOString() },
        leaseExpiresAt: { $date: leaseExpiresAt.toISOString() },
      }],
    })) as { n?: number; writeErrors?: Array<{ code?: number; errmsg?: string }> };

    const duplicate = inserted.writeErrors?.some((e) => e.code === 11000 || isDuplicate(e.errmsg));
    if (!duplicate) return { acquired: true, token };

    const takeover = (await prisma.$runCommandRaw({
      findAndModify: "EventDispatchClaim",
      query: {
        _id: key,
        state: "IN_PROGRESS",
        leaseExpiresAt: { $lte: { $date: now.toISOString() } },
      },
      update: {
        $set: {
          token,
          updatedAt: { $date: now.toISOString() },
          leaseExpiresAt: { $date: leaseExpiresAt.toISOString() },
        },
      },
      new: true,
    })) as { value?: { token?: string } | null };

    return { acquired: takeover.value?.token === token, token: takeover.value?.token === token ? token : null };
  } catch (error) {
    if (isDuplicate(error instanceof Error ? error.message : error)) return { acquired: false, token: null };
    console.error("claimDispatch failed; dispatching anyway", { event, donationId, error: error instanceof Error ? error.message : String(error) });
    // Fail open for availability. A null token means there is no claim to complete.
    return { acquired: true, token: null };
  }
}

async function completeDispatchClaim(event: MessageTriggerEvent, donationId: string, token: string | null): Promise<void> {
  if (!token) return;
  const now = new Date();
  await prisma.$runCommandRaw({
    findAndModify: "EventDispatchClaim",
    query: { _id: dispatchClaimKey(event, donationId), token, state: "IN_PROGRESS" },
    update: {
      $set: {
        state: "COMPLETED",
        completedAt: { $date: now.toISOString() },
        updatedAt: { $date: now.toISOString() },
      },
      $unset: { token: "", leaseExpiresAt: "" },
    },
    new: false,
  }).catch((error) => {
    console.error("completeDispatchClaim failed", { event, donationId, error: error instanceof Error ? error.message : String(error) });
  });
}

export async function dispatchEvent(event: MessageTriggerEvent, input: EventDispatchInput): Promise<DispatchResult> {
  const result: DispatchResult = { triggers: 0, emailsSent: 0, whatsappSent: 0, skipped: 0, errors: 0, skipReasons: {} };
  let claimToken: string | null = null;
  let claimed = false;

  if (input.donationId && (event === "DONATION_PAID" || event === "DONATION_FAILED" || event === "FIRST_DONATION")) void notifyDonationEvent(event, input.donationId);

  try {
    // Do not consume the once-per-donation claim until we know there is actual work and a
    // renderable recipient. This keeps a temporarily missing trigger/context retryable.
    const triggers = await prisma.messageTrigger.findMany({ where: { event, enabled: true } });
    result.triggers = triggers.length;
    if (!triggers.length) {
      await writeAuditLog({
        actorRole: "SYSTEM",
        action: "EVENT_DISPATCH_NO_TRIGGERS",
        messageAr: `لا توجد رسائل تلقائية مفعّلة عند «${triggerEventLabelAr(event)}»`,
        metadata: { event, ...input },
        stream: "TEAM",
      });
      return result;
    }

    const ctx: TemplateContext | null = input.donationId ? await loadContextForDonation(input.donationId) : input.userId ? await loadContext(input.userId) : null;
    if (!ctx) {
      await writeAuditLog({ actorRole: "SYSTEM", action: "EVENT_DISPATCH_NO_CONTEXT", messageAr: `تعذّر إرسال الرسائل التلقائية عند «${triggerEventLabelAr(event)}»  بيانات المستلم غير متاحة`, metadata: { event, ...input }, stream: "TEAM" });
      return result;
    }

    if (input.donationId && ONCE_PER_DONATION.has(event)) {
      const claim = await claimDispatch(event, input.donationId);
      if (!claim.acquired) return result;
      claimed = true;
      claimToken = claim.token;
    }

    const locale = pickLocale({ recipientLang: ctx.user.preferredLang });
    const config = await resolveTriggerSendConfig();

    let attachments: EmailAttachment[] | undefined;
    if (event === "DONATION_PAID" && input.donationId && triggers.some((trigger) => trigger.channel === "EMAIL")) {
      attachments = await donationPaidAttachments(input.donationId);
    }

    for (const trigger of triggers) {
      try {
        const sent = await sendTriggerMessage(trigger, ctx, { event, locale, config, donationId: input.donationId ?? null, attachments });
        if (!sent) {
          result.skipped += 1;
          result.skipReasons.TEMPLATE_NOT_FOUND = (result.skipReasons.TEMPLATE_NOT_FOUND ?? 0) + 1;
          continue;
        }
        if (sent.outcome === "SENT") {
          if (sent.channel === "EMAIL") result.emailsSent += 1;
          else result.whatsappSent += 1;
        } else if (sent.outcome === "SKIPPED") {
          result.skipped += 1;
          const reason = sent.reason ?? "SKIPPED";
          result.skipReasons[reason] = (result.skipReasons[reason] ?? 0) + 1;
        } else {
          result.errors += 1;
        }
      } catch (error) {
        result.errors += 1;
        console.error("sendTriggerMessage failed", {
          event,
          donationId: input.donationId ?? null,
          channel: trigger.channel,
          templateId: trigger.templateId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const parts = [
      result.emailsSent ? `${result.emailsSent} بريد` : null,
      result.whatsappSent ? `${result.whatsappSent} واتساب` : null,
      result.skipped ? `${result.skipped} متخطى` : null,
      result.errors ? `${result.errors} فشل` : null,
    ].filter(Boolean);

    await writeAuditLog({
      actorRole: "SYSTEM",
      action: "EVENT_DISPATCH",
      messageAr: `رسائل تلقائية عند «${triggerEventLabelAr(event)}»  ${parts.join("، ") || "لم يتم إرسال شيء"}`,
      metadata: { event, ...input, ...result },
      stream: "TEAM",
    });

    // Only a run that reached the end becomes permanently deduplicated. A process killed after
    // acquiring the claim leaves an expiring lease and can be recovered on a later callback/retry.
    if (claimed && input.donationId) {
      await completeDispatchClaim(event, input.donationId, claimToken);
    }
  } catch (error) {
    result.errors += 1;
    console.error("dispatchEvent failed", { event, ...input, error: error instanceof Error ? error.message : String(error) });
    // Do not complete the claim here: the lease is intentionally left recoverable.
  }
  return result;
}

/** The PDFs for a confirmed donation, or nothing if they cannot be produced right now. */
async function donationPaidAttachments(donationId: string): Promise<EmailAttachment[] | undefined> {
  try {
    const docs = await ensureDonationDocuments(donationId);
    if (!docs) return undefined;
    return await donationAttachments(docs, await getServerBaseUrl());
  } catch (error) {
    console.error("dispatchEvent DONATION_PAID attachments failed", { donationId, error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

export async function dispatchDonationPaid(donationId: string): Promise<void> {
  /* Serials are minted here, at confirmation, before anything is sent 
     `DONATION_LOGIC_SPEC §2`. Idempotent: a replayed webhook finds the same
     records. A failure is logged and never blocks the notifications. */
  try {
    await ensureDonationDocuments(donationId);
  } catch (error) {
    console.error("dispatchDonationPaid issue documents failed", { donationId, error: error instanceof Error ? error.message : String(error) });
  }
  await dispatchEvent("DONATION_PAID", { donationId });
  /* Gifted lines: tell the recipient, with a certificate in their name.
     Per-line idempotent; a failure is logged and the rest still runs. */
  try {
    const { deliverDonationGifts } = await import("@/lib/donations/gift-delivery");
    await deliverDonationGifts(donationId);
  } catch (error) {
    console.error("dispatchDonationPaid gift delivery failed", { donationId, error: error instanceof Error ? error.message : String(error) });
  }
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
