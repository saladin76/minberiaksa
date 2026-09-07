import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { CommunicationCampaign } from "@prisma/client";
import { getCampaign } from "./campaign-service";
import { planCampaignSend, type SendPlan } from "./campaign-send-planner";
import { renderChannelTemplate } from "./template-compat";
import { loadContextsForUserIds } from "@/lib/templates/variables";
import { createDeliveryRecord, recordSkippedDelivery, markDeliveryStatus } from "./delivery-log-service";
import { resolveProviderForSendWithRuntime, sendPreparedDelivery } from "./provider-router";
import { EMAIL_PROVIDER_ID } from "./providers/email/client";
import { getActiveCommunicationRuntimeBundle } from "./runtime-config";
import { listSenders, toSenderConfig } from "./sender-service";
import { listRoutingRules, toRoutingRuleConfig } from "./routing-rule-service";
import { resolveSender } from "./sender-router";
import { resolveAudienceOrigin } from "./audience-list-service";
import { computeFinalStatus, recomputeCampaignCounters } from "./campaign-counter-service";
import { type CommunicationChannelId, type CommunicationPurposeId } from "./communication-runtime-types";

export { computeFinalStatus };

const PROCESSED_STATUSES = ["RENDERED", "QUEUED", "SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"];
type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;
export type SendMode = "SEND_NOW" | "DUE";
export type ExecutionSummary = { ok: boolean; campaignId: string; status: string; total: number; sent: number; skipped: number; failed: number; truncated: boolean; reasons: Record<string, number>; blocked?: string };

function bump(reasons: Record<string, number>, key: string) { reasons[key] = (reasons[key] ?? 0) + 1; }
function coverageDecisions(campaign: CommunicationCampaign): Record<string, string> { return ((campaign.metadata as Record<string, unknown> | null)?.coverageDecisions ?? {}) as Record<string, string>; }
function mergedMetadata(campaign: CommunicationCampaign, lastRun: Record<string, unknown>) { return { ...(campaign.metadata as Record<string, unknown> | null), lastRun } as never; }
async function auditBlocked(campaign: CommunicationCampaign, reason: string, actor: Actor, mode: SendMode, plan?: SendPlan) {
  await writeAuditLog({ actorId: actor?.actorId ?? undefined, actorName: actor?.actorName ?? undefined, actorRole: actor?.actorRole ?? "ADMIN", action: "communication.campaign.send.blocked", messageAr: `تعذّر إرسال حملة «${campaign.name}» — السبب: ${reason}`, messageEn: `Campaign send blocked: ${campaign.name} — ${reason}`, entityType: "CommunicationCampaign", entityId: campaign.id, metadata: { mode, reason, summary: plan ? { total: plan.total, eligible: plan.eligible, skipped: plan.skipped, reasons: plan.reasons } : undefined, externalCall: false, autoSend: false }, stream: "TEAM" });
}

export async function executeCampaignSend(campaignId: string, opts: { actor?: Actor; mode?: SendMode; batchSize?: number } = {}): Promise<ExecutionSummary> {
  const mode = opts.mode ?? "SEND_NOW";
  const batchSize = Math.min(opts.batchSize ?? 200, 1000);
  const actor = opts.actor ?? null;
  const base: ExecutionSummary = { ok: false, campaignId, status: "", total: 0, sent: 0, skipped: 0, failed: 0, truncated: false, reasons: {} };
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ...base, blocked: "NOT_FOUND" };
  base.status = campaign.status;
  if (mode === "SEND_NOW" && campaign.status !== "APPROVED") { await auditBlocked(campaign, "NOT_APPROVED", actor, mode); return { ...base, blocked: "NOT_APPROVED" }; }
  if (mode === "DUE" && (campaign.status !== "SCHEDULED" || !campaign.scheduledAt || campaign.scheduledAt.getTime() > Date.now())) {
    const reason = campaign.status !== "SCHEDULED" ? "NOT_SCHEDULED" : "NOT_DUE";
    await auditBlocked(campaign, reason, actor, mode);
    return { ...base, blocked: reason };
  }

  const plan = await planCampaignSend(campaignId, { batchSize });
  base.total = plan.total; base.truncated = plan.truncated; base.reasons = { ...plan.reasons };
  if (plan.blocked) {
    await auditBlocked(campaign, plan.blocked, actor, mode, plan);
    await prisma.communicationCampaign.update({ where: { id: campaignId }, data: { metadata: mergedMetadata(campaign, { ranAt: new Date().toISOString(), mode, total: plan.total, sent: 0, skipped: plan.skipped, failed: 0, blocked: plan.blocked, reasons: plan.reasons, truncated: plan.truncated }) } }).catch(() => {});
    return { ...base, blocked: plan.blocked };
  }

  const runtime = await getActiveCommunicationRuntimeBundle();
  const channel = campaign.channel as CommunicationChannelId;
  const templateId = campaign.templateGroupId as string;
  const decisions = coverageDecisions(campaign);
  const purpose = campaign.purpose as CommunicationPurposeId;
  const origin = await resolveAudienceOrigin(campaign.audienceSegmentKey);
  await prisma.communicationCampaign.update({ where: { id: campaignId }, data: { status: "SENDING" } }).catch(() => {});
  const [senders, rules] = await Promise.all([listSenders(), listRoutingRules(channel)]);
  const senderConfigs = senders.filter((sender) => sender.channel === channel).map(toSenderConfig);
  const ruleConfigs = rules.map(toRoutingRuleConfig);
  const rawSenderById = new Map(senders.map((sender) => [sender.id, sender]));
  const defaultEmailIdentity = senders.find((sender) => sender.channel === "EMAIL" && sender.enabled)?.senderEmail || (runtime.elasticEmail.configured ? runtime.elasticEmail.values.senderEmail : null);
  const existing = await prisma.communicationDelivery.findMany({ where: { campaignId, templateId, channel, origin }, select: { recipientUserId: true, status: true, providerMessageId: true } }).catch(() => []);
  const alreadyDone = new Set(existing.filter((delivery) => (delivery.status && PROCESSED_STATUSES.includes(delivery.status)) || !!delivery.providerMessageId).map((delivery) => delivery.recipientUserId).filter(Boolean) as string[]);

  for (const skipped of plan.skippedList.slice(0, batchSize)) {
    if (alreadyDone.has(skipped.userId)) continue;
    await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: skipped.userId, locale: skipped.locale, purpose, origin, createdBy: actor?.actorId ?? null }, skipped.reason);
    base.skipped += 1; bump(base.reasons, skipped.reason);
  }

  // One batched query for every recipient variable set, rather than per-message: without a real
  // context the renderer falls back to SAMPLE values, which is how campaigns were going out
  // addressed to the sample donor instead of the actual one.
  const contexts = await loadContextsForUserIds(plan.recipients.map((r) => r.userId)).catch(() => new Map());

  for (const recipient of plan.recipients) {
    if (alreadyDone.has(recipient.userId)) { bump(base.reasons, "ALREADY_PROCESSED"); continue; }
    const recipientCtx = contexts.get(recipient.userId) ?? null;
    if (!recipientCtx) {
      await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin }, "CONTEXT_LOAD_FAILED");
      base.skipped += 1; bump(base.reasons, "CONTEXT_LOAD_FAILED"); continue;
    }
    const rendered = await renderChannelTemplate(channel, templateId, recipient.locale, recipientCtx);
    if (!rendered) {
      await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin }, "TEMPLATE_RENDER_FAILED");
      base.skipped += 1; bump(base.reasons, "TEMPLATE_RENDER_FAILED"); continue;
    }
    if (rendered.usedFallback && decisions[recipient.locale] === "EXCLUDE") {
      await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin, templateName: rendered.templateName }, "LANGUAGE_EXCLUDED");
      base.skipped += 1; bump(base.reasons, "LANGUAGE_EXCLUDED"); continue;
    }

    let sender: { id?: string; provider?: string | null; phoneNumberId?: string | null; senderEmail?: string | null; smsSender?: string | null } | null = null;
    if (channel === "EMAIL") sender = defaultEmailIdentity ? { senderEmail: defaultEmailIdentity } : null;
    else {
      const routed = resolveSender({ channel, locale: recipient.locale, country: recipient.country, purpose: purpose === "MARKETING" ? "MARKETING" : "TRANSACTIONAL" }, senderConfigs, ruleConfigs);
      const raw = "sender" in routed ? rawSenderById.get(routed.sender.id) : null;
      if (channel === "SMS") sender = { id: raw?.id, provider: raw?.provider, smsSender: raw?.smsSender ?? null };
      else if (raw) sender = { id: raw.id, provider: raw.provider, phoneNumberId: raw.phoneNumberId, smsSender: raw.smsSender };
      else if (runtime.meta.configured) sender = { phoneNumberId: runtime.meta.values.defaultPhoneNumberId };
    }
    const to = channel === "EMAIL" ? recipient.email ?? "" : recipient.phone ?? "";
    const decision = resolveProviderForSendWithRuntime(runtime, channel, sender, { country: recipient.country, phone: to });
    const provider = decision.canSend ? decision.providerId : channel === "WHATSAPP" ? "META_WHATSAPP" : channel === "EMAIL" ? EMAIL_PROVIDER_ID : undefined;
    const created = await createDeliveryRecord({ channel, provider: provider as never, campaignId, templateId, templateName: rendered.templateName, recipientUserId: recipient.userId, recipientEmail: channel === "EMAIL" ? recipient.email : null, recipientPhone: channel !== "EMAIL" ? recipient.phone : null, recipientName: recipient.name, locale: recipient.locale, purpose, origin, renderedSubject: rendered.subject, renderedBody: rendered.body, senderId: sender?.id ?? null, createdBy: actor?.actorId ?? null, status: "RENDERED" });
    if (!created.ok) { base.failed += 1; bump(base.reasons, "ARCHIVE_FAILED"); continue; }
    const deliveryId = created.data.id;
    if (!sender && channel !== "SMS") {
      await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: "NO_SENDER_AVAILABLE" });
      base.skipped += 1; bump(base.reasons, "NO_SENDER_AVAILABLE"); continue;
    }
    const result = await sendPreparedDelivery({ channel, sender, country: recipient.country, to, templateName: rendered.templateName, languageCode: recipient.locale, subject: rendered.subject, html: rendered.body }, runtime);
    if (!result.ok) {
      const terminal = result.reason.endsWith("_NOT_CONFIGURED") || result.reason.endsWith("_NOT_IMPLEMENTED") || result.reason.includes("SENDER_MISSING") || result.reason === "PROVIDER_DISABLED" || result.reason === "INTEGRATION_DECRYPTION_FAILED" || result.reason === "INTEGRATION_DATABASE_UNAVAILABLE";
      // `detail` carries the provider's own answer — the HTTP status and the scrubbed response body
      // (e.g. `406: {"code":"30","description":"Check the usercode-password information and API
      // access permission"}`). Dropping it left the send log showing only NETGSM_REQUEST_FAILED,
      // with the one line that explains the failure existing nowhere at all. The adapters already
      // scrub credentials out of `detail` before returning it.
      await markDeliveryStatus(deliveryId, terminal ? "SKIPPED" : "FAILED", {
        errorMessage: result.detail ? `${result.reason} — ${result.detail}` : result.reason,
      });
      if (terminal) base.skipped += 1; else base.failed += 1;
      bump(base.reasons, result.reason); continue;
    }
    await markDeliveryStatus(deliveryId, "SENT", { providerMessageId: result.providerMessageId, internalAccepted: result.internalAccepted });
    base.sent += 1; bump(base.reasons, "SENT");
  }

  const finalStatus = computeFinalStatus(base.total, base.sent, base.skipped, base.failed);
  await prisma.communicationCampaign.update({ where: { id: campaignId }, data: { status: finalStatus, metadata: mergedMetadata(campaign, { ranAt: new Date().toISOString(), mode, total: base.total, sent: base.sent, skipped: base.skipped, failed: base.failed, blocked: null, reasons: base.reasons, truncated: base.truncated }) } }).catch(() => {});
  // The counters are derived from the delivery rows rather than incremented by this run's tallies.
  // `{ increment }` double-counted a re-run and, more importantly, froze `sentCount` at "the
  // provider accepted it" — the number the event webhook later contradicts. Deriving keeps the
  // header and the delivery log answering the same question, and it is what lets a later
  // Suppress/bounce pull `sentCount` back down instead of leaving the campaign claiming success.
  await recomputeCampaignCounters(campaignId).catch(() => {});
  await writeAuditLog({ actorId: actor?.actorId ?? undefined, actorName: actor?.actorName ?? undefined, actorRole: actor?.actorRole ?? "ADMIN", action: "communication.campaign.send", messageAr: `تنفيذ إرسال حملة «${campaign.name}» — أُرسل ${base.sent}، تخطّي ${base.skipped}، فشل ${base.failed}`, messageEn: `Campaign send executed: ${campaign.name} — sent ${base.sent}, skipped ${base.skipped}, failed ${base.failed}`, entityType: "CommunicationCampaign", entityId: campaignId, metadata: { mode, sent: base.sent, skipped: base.skipped, failed: base.failed, truncated: base.truncated, externalCall: base.sent > 0 }, stream: "TEAM" });
  base.ok = true; base.status = finalStatus; return base;
}

export async function runDueCampaigns(opts: { actor?: Actor; max?: number } = {}): Promise<ExecutionSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const due = await prisma.communicationCampaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, select: { id: true }, take: Math.min(opts.max ?? 10, 50) }).catch(() => []);
  const results: ExecutionSummary[] = [];
  for (const campaign of due) results.push(await executeCampaignSend(campaign.id, { actor: opts.actor, mode: "DUE" }));
  return results;
}
