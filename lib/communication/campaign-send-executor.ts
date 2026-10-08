import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { CommunicationCampaign } from "@prisma/client";
import { getCampaign } from "./campaign-service";
import { planCampaignSend, type SendPlan } from "./campaign-send-planner";
import { renderChannelTemplate } from "./template-compat";
import { loadContextsForUserIds } from "@/lib/templates/variables";
import { loadUpdateSource, sourceUpdateOf, updateContextFor } from "./update-campaign";
import { createDeliveryRecord as persistDelivery, recordSkippedDelivery as persistSkipped, markDeliveryStatus as persistStatus, updateDeliveryVariables as persistVariables } from "./delivery-log-service";
import { resolveProviderForSendWithRuntime, sendPreparedDelivery } from "./provider-router";
import { EMAIL_PROVIDER_ID } from "./providers/email/client";
import { getActiveCommunicationRuntimeBundle } from "./runtime-config";
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot } from "./sender-resolution";
import { resolveVariantForLocale, NOT_READY, META_PROVIDER } from "./whatsapp-template-sync";
import { buildMetaComponents } from "./providers/meta-whatsapp/parameters";
import { buildWhatsappRenderedPreview } from "./whatsapp-rendered-preview";
import { resolveAudienceOrigin } from "./audience-list-service";
import { computeFinalStatus, recomputeCampaignCounters } from "./campaign-counter-service";
import { type CommunicationChannelId, type CommunicationPurposeId } from "./communication-runtime-types";
import { autoSpeedMode, campaignPriorityRank, campaignSendControls, evaluateCampaignSendControls, insideQuietHours, speedSettings, type CampaignSpeedMode, type CampaignSendControls } from "./campaign-send-controls";
import { mergeCampaignMetadata, mutateCampaignMetadata } from "./campaign-metadata-store";
import { phoneMatchVariants } from "./phone";
import { normalizeCampaignContact } from "./campaign-contact-validation";
import { checkCampaignRecipientBeforeSend } from "./campaign-recipient-guard";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import { recipientTimeZone } from "./recipient-timezone";

export { computeFinalStatus };
const QUIET_RETRY_MS = 5 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_BATCHES = 5;
const MAX_BLOCKED_RESUMES = 3;
const RUN_BUDGET_MS = 210_000;
const PROCESSED_STATUSES = ["RENDERED", "QUEUED", "SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED", "FAILED", "SKIPPED", "BOUNCED", "UNSUBSCRIBED", "CANCELLED"];
const ACCEPTED_STATUSES = new Set(["SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED"]);

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;
export type SendMode = "SEND_NOW" | "DUE" | "RESUME";
export type ExecutionSummary = {
  ok: boolean; campaignId: string; status: string; total: number; sent: number; skipped: number; failed: number;
  truncated: boolean; reasons: Record<string, number>; blocked?: string; batches?: number; hasMore?: boolean;
};
type SendProgress = {
  cursor: string | null; batches: number; total: number; sent: number; skipped: number; failed: number;
  reasons: Record<string, number>; startedAt: string; updatedAt: string; done: boolean; blockedRuns: number;
};
type Lease = { token: string; expiresAt: string; holder?: string | null };
type BatchTally = { total: number; sent: number; skipped: number; failed: number; reasons: Record<string, number> };
type ExecutionOptions = { actor?: Actor; mode?: SendMode; batchSize?: number; maxBatches?: number; timeBudgetMs?: number };

/** A failed archive write must stop the cursor, not become a fabricated outcome. */
async function requireStored<T extends { ok: boolean }>(pending: Promise<T>): Promise<T> {
  const result = await pending;
  if (!result.ok) throw new Error("ARCHIVE_WRITE_FAILED");
  return result;
}
const createDeliveryRecord = (...args: Parameters<typeof persistDelivery>) => requireStored(persistDelivery(...args));
const recordSkippedDelivery = (...args: Parameters<typeof persistSkipped>) => requireStored(persistSkipped(...args));
const markDeliveryStatus = (...args: Parameters<typeof persistStatus>) => requireStored(persistStatus(...args));
const updateDeliveryVariables = (...args: Parameters<typeof persistVariables>) => requireStored(persistVariables(...args));

async function queueRecipientQuietHours(campaignId: string, plan: SendPlan, controls: CampaignSendControls): Promise<{ plan: SendPlan; deferred: number }> {
  if (!controls.quietHours.enabled || controls.quietHours.timezoneMode !== "RECIPIENT") return { plan, deferred: 0 };
  const now = new Date();
  const quiet = plan.recipients.filter((recipient) => insideQuietHours(controls, now, recipientTimeZone({ country: recipient.country, phone: recipient.phone }, controls.quietHours.timezone)));
  if (!quiet.length) return { plan, deferred: 0 };
  const nextAttemptAt = new Date(now.getTime() + QUIET_RETRY_MS);
  await mapWithConcurrency(quiet, 10, async (recipient) => prisma.communicationCampaignDeferredRecipient.upsert({
    where: { campaignId_cursorId: { campaignId, cursorId: recipient.cursorId } },
    create: { campaignId, cursorId: recipient.cursorId, userId: recipient.userId, name: recipient.name, email: recipient.email, phone: recipient.phone, locale: recipient.locale, country: recipient.country, nextAttemptAt },
    update: { name: recipient.name, email: recipient.email, phone: recipient.phone, locale: recipient.locale, country: recipient.country, nextAttemptAt },
  }));
  const quietIds = new Set(quiet.map((recipient) => recipient.cursorId));
  const activeRecipients = plan.recipients.filter((recipient) => !quietIds.has(recipient.cursorId));
  return { deferred: quiet.length, plan: { ...plan, recipients: activeRecipients, eligible: activeRecipients.length, total: plan.total } };
}

async function loadDueQuietRecipients(campaignId: string, controls: CampaignSendControls, limit: number): Promise<{ recipients: SendPlan["recipients"]; queueIds: string[] }> {
  const rows = await prisma.communicationCampaignDeferredRecipient.findMany({
    where: { campaignId, nextAttemptAt: { lte: new Date() } }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: Math.min(Math.max(limit, 1), 1000),
  });
  const now = new Date();
  const ready: typeof rows = [], stillQuiet: typeof rows = [];
  for (const row of rows) {
    const zone = recipientTimeZone({ country: row.country, phone: row.phone }, controls.quietHours.timezone);
    if (controls.quietHours.enabled && controls.quietHours.timezoneMode === "RECIPIENT" && insideQuietHours(controls, now, zone)) stillQuiet.push(row);
    else ready.push(row);
  }
  if (stillQuiet.length) await prisma.communicationCampaignDeferredRecipient.updateMany({ where: { id: { in: stillQuiet.map((row) => row.id) } }, data: { nextAttemptAt: new Date(now.getTime() + QUIET_RETRY_MS) } });
  return { queueIds: ready.map((row) => row.id), recipients: ready.map((row) => ({ cursorId: row.cursorId, userId: row.userId, name: row.name, email: row.email, phone: row.phone, locale: (isValidLocale(row.locale) ? row.locale : DEFAULT_LOCALE) as SupportedLocale, country: row.country })) };
}

async function countDeferredQuietRecipients(campaignId: string): Promise<number> {
  // A failed read is NOT proof the queue is empty.
  return prisma.communicationCampaignDeferredRecipient.count({ where: { campaignId } });
}

async function loadWhatsappTemplateTruth(templateId: string): Promise<{
  byWaba: Map<string, Parameters<typeof resolveVariantForLocale>[0]>;
  positionalNames: string[]; scopedNames: Record<string, string>; headerMediaUrl: string | null; headerMediaFilename: string | null;
  headerLocation: { latitude: number; longitude: number; name?: string; address?: string } | null;
}> {
  const [variants, tpl] = await Promise.all([
    prisma.whatsappTemplateWabaVariant.findMany({ where: { templateId, provider: META_PROVIDER }, select: { businessAccountId: true, languageCode: true, locale: true, approvalStatus: true, category: true, providerTemplateName: true, componentsSchema: true, rejectionReason: true, lastSyncedAt: true } }),
    prisma.whatsappTemplate.findUnique({ where: { id: templateId }, select: { variables: true, header: true } }),
  ]);
  const byWaba = new Map<string, Parameters<typeof resolveVariantForLocale>[0]>();
  for (const row of variants) { const list = byWaba.get(row.businessAccountId) ?? []; list.push(row); byWaba.set(row.businessAccountId, list); }
  const catalog = Array.isArray(tpl?.variables) ? tpl!.variables as unknown[] : [];
  const positionalNames: string[] = [];
  const scopedNames: Record<string, string> = {};
  for (const entry of catalog) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { key?: unknown; scope?: unknown; position?: unknown };
    const key = String(row.key ?? "");
    if (!key) continue;
    if (!positionalNames.includes(key)) positionalNames.push(key);
    const scope = typeof row.scope === "string" ? row.scope : null;
    const position = Number(row.position);
    if (scope && Number.isFinite(position) && position > 0) scopedNames[`${scope}.${position}`] = key;
  }
  const header = tpl?.header && typeof tpl.header === "object" ? tpl.header as Record<string, unknown> : {};
  const headerMediaUrl = typeof header.mediaUrl === "string" && header.mediaUrl.trim() ? header.mediaUrl.trim() : null;
  const headerMediaFilename = typeof header.fileName === "string" && header.fileName.trim() ? header.fileName.trim() : null;
  const latitude = Number(header.latitude), longitude = Number(header.longitude);
  const headerLocation = Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude, ...(typeof header.name === "string" && header.name.trim() ? { name: header.name.trim() } : {}), ...(typeof header.address === "string" && header.address.trim() ? { address: header.address.trim() } : {}) } : null;
  return { byWaba, positionalNames, scopedNames, headerMediaUrl, headerMediaFilename, headerLocation };
}

function templateValuesFor(names: string[], ctx: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  names.forEach((name, index) => {
    let node: unknown = ctx;
    for (const key of name.split(".")) {
      if (!node || typeof node !== "object") { node = undefined; break; }
      node = (node as Record<string, unknown>)[key];
    }
    if (typeof node !== "string" && typeof node !== "number") return;
    out[name] = String(node); out[String(index + 1)] = String(node);
  });
  return out;
}
function bump(reasons: Record<string, number>, key: string) { reasons[key] = (reasons[key] ?? 0) + 1; }
function normalizeRecipientContact(channel: CommunicationChannelId, email: string | null | undefined, phone: string | null | undefined): string | null {
  const canonical = normalizeCampaignContact(channel, channel === "EMAIL" ? email : phone);
  return canonical ? `${channel === "EMAIL" ? "email" : "phone"}:${canonical}` : null;
}
function metaOf(campaign: CommunicationCampaign) { return campaign.metadata as Record<string, unknown> | null ?? {}; }
function coverageDecisions(campaign: CommunicationCampaign): Record<string, string> { return (metaOf(campaign).coverageDecisions ?? {}) as Record<string, string>; }
function progressOf(campaign: CommunicationCampaign): SendProgress | null {
  const raw = metaOf(campaign).sendProgress as Partial<SendProgress> | undefined;
  if (!raw || typeof raw !== "object") return null;
  return { cursor: typeof raw.cursor === "string" ? raw.cursor : null, batches: Number(raw.batches) || 0, total: Number(raw.total) || 0, sent: Number(raw.sent) || 0, skipped: Number(raw.skipped) || 0, failed: Number(raw.failed) || 0, reasons: (raw.reasons && typeof raw.reasons === "object" ? raw.reasons : {}) as Record<string, number>, startedAt: typeof raw.startedAt === "string" ? raw.startedAt : new Date().toISOString(), updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(), done: raw.done === true, blockedRuns: Number(raw.blockedRuns) || 0 };
}
function leaseFromMetadata(metadata: Record<string, unknown>): Lease | null {
  const raw = metadata.sendLease as Partial<Lease> | undefined;
  return raw && typeof raw.token === "string" && typeof raw.expiresAt === "string" ? { token: raw.token, expiresAt: raw.expiresAt, holder: raw.holder ?? null } : null;
}
function leaseOf(campaign: CommunicationCampaign): Lease | null { return leaseFromMetadata(metaOf(campaign)); }
function leaseIsFresh(lease: Lease | null): boolean {
  return !!lease && Number.isFinite(Date.parse(lease.expiresAt)) && Date.parse(lease.expiresAt) > Date.now();
}
function newLease(actor: Actor): Lease { return { token: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, expiresAt: new Date(Date.now() + LEASE_MS).toISOString(), holder: actor?.actorName ?? actor?.actorRole ?? null }; }

/** Never overwrite concurrent campaign cancellation or another runner's lease. */
async function patchMetadata(campaignId: string, patch: Record<string, unknown>, leaseToken: string) {
  const saved = await mutateCampaignMetadata(campaignId, (current) => leaseFromMetadata(current)?.token === leaseToken ? { ...current, ...patch } : null, { expectedStatus: "SENDING" });
  if (!saved) throw new Error("CAMPAIGN_LEASE_LOST");
}
async function auditBlocked(campaign: CommunicationCampaign, reason: string, actor: Actor, mode: SendMode, plan?: SendPlan) {
  await writeAuditLog({ actorId: actor?.actorId ?? undefined, actorName: actor?.actorName ?? undefined, actorRole: actor?.actorRole ?? "ADMIN", action: "communication.campaign.send.blocked", messageAr: `تعذّر إرسال حملة «${campaign.name}» - السبب: ${reason}`, messageEn: `Campaign send blocked: ${campaign.name} - ${reason}`, entityType: "CommunicationCampaign", entityId: campaign.id, metadata: { mode, reason, summary: plan ? { total: plan.total, eligible: plan.eligible, skipped: plan.skipped, reasons: plan.reasons } : undefined, externalCall: false, autoSend: false }, stream: "TEAM" });
}
function concurrencyFromEnv(name: string, fallback: number, cap = 50): number {
  const parsed = Number(process.env[name]); return !Number.isFinite(parsed) || parsed < 1 ? fallback : Math.min(Math.floor(parsed), cap);
}
function sendConcurrency(channel: CommunicationChannelId, speedMode: CampaignSpeedMode = "BALANCED"): number {
  const speed = speedSettings(speedMode);
  if (channel === "WHATSAPP") return concurrencyFromEnv("COMMUNICATION_WHATSAPP_CONCURRENCY", speed.concurrency);
  if (channel === "EMAIL") return concurrencyFromEnv("COMMUNICATION_EMAIL_CONCURRENCY", Math.max(speed.concurrency, 20));
  return concurrencyFromEnv("COMMUNICATION_SMS_CONCURRENCY", speed.concurrency);
}
/** Drain already-started workers before propagating failure; stop taking new work. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let nextIndex = 0, failed = false;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try { output[index] = await worker(items[index], index); }
      catch (error) { if (!failed) { failure = error; failed = true; } }
    }
  }));
  if (failed) throw failure;
  return output;
}
function mergeBatchTally(target: BatchTally, source: BatchTally) {
  target.sent += source.sent; target.skipped += source.skipped; target.failed += source.failed;
  for (const [key, value] of Object.entries(source.reasons)) target.reasons[key] = (target.reasons[key] ?? 0) + value;
}

/** Public executor reports interruption without inventing a completed campaign. */
export async function executeCampaignSend(campaignId: string, opts: ExecutionOptions = {}): Promise<ExecutionSummary> {
  try { return await executeCampaignRun(campaignId, opts); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const blocked = /^[A-Z_]{3,80}$/.test(message) ? message : "EXECUTION_INTERRUPTED";
    const current = await getCampaign(campaignId).catch(() => null);
    // Interrupted leases expire normally. No cursor is advanced here; resumes
    // check durable delivery records before attempting any provider call.
    return { ok: false, campaignId, status: current?.status ?? "UNKNOWN", total: 0, sent: 0, skipped: 0, failed: 0, truncated: true, hasMore: current?.status === "SENDING", reasons: { [blocked]: 1 }, blocked, batches: 0 };
  }
}

async function executeCampaignRun(campaignId: string, opts: ExecutionOptions): Promise<ExecutionSummary> {
  const mode = opts.mode ?? "SEND_NOW";
  const maxBatches = Number.isFinite(opts.maxBatches ?? DEFAULT_MAX_BATCHES) ? Math.max(1, Math.min(Math.floor(opts.maxBatches ?? DEFAULT_MAX_BATCHES), 50)) : DEFAULT_MAX_BATCHES;
  const timeBudget = Number.isFinite(opts.timeBudgetMs ?? RUN_BUDGET_MS) ? Math.max(1, Math.min(opts.timeBudgetMs ?? RUN_BUDGET_MS, RUN_BUDGET_MS)) : RUN_BUDGET_MS;
  const deadline = Date.now() + timeBudget;
  const actor = opts.actor ?? null;
  const base: ExecutionSummary = { ok: false, campaignId, status: "", total: 0, sent: 0, skipped: 0, failed: 0, truncated: false, reasons: {}, batches: 0 };
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ...base, blocked: "NOT_FOUND" };
  base.status = campaign.status;
  const controlGate = await evaluateCampaignSendControls(campaign);
  if (!controlGate.ok) return { ...base, blocked: controlGate.reason };
  const speed = speedSettings(controlGate.controls.speedMode);
  const requestedBatch = Number.isFinite(opts.batchSize ?? speed.batchSize) ? Math.max(1, Math.min(Math.floor(opts.batchSize ?? speed.batchSize), 1000)) : speed.batchSize;
  const batchSize = Math.max(1, Math.min(requestedBatch, controlGate.remainingDaily ?? requestedBatch));
  if (mode === "SEND_NOW" || mode === "DUE") {
    if (mode === "SEND_NOW" && campaign.status !== "APPROVED") { await auditBlocked(campaign, "NOT_APPROVED", actor, mode); return { ...base, blocked: "NOT_APPROVED" }; }
    if (mode === "DUE" && (campaign.status !== "SCHEDULED" || !campaign.scheduledAt || campaign.scheduledAt.getTime() > Date.now())) {
      const reason = campaign.status !== "SCHEDULED" ? "NOT_SCHEDULED" : "NOT_DUE";
      await auditBlocked(campaign, reason, actor, mode); return { ...base, blocked: reason };
    }
  } else if (campaign.status !== "SENDING") return { ...base, blocked: "NOT_RESUMABLE" };
  else {
    if (progressOf(campaign)?.done) return { ...base, blocked: "ALREADY_COMPLETE" };
    if (leaseIsFresh(leaseOf(campaign))) return { ...base, blocked: "ALREADY_RUNNING" };
  }
  const resuming = mode === "RESUME";
  const observedProgress = JSON.stringify(metaOf(campaign).sendProgress ?? null);
  const progress: SendProgress = progressOf(campaign) ?? { cursor: null, batches: 0, total: 0, sent: 0, skipped: 0, failed: 0, reasons: {}, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), done: false, blockedRuns: 0 };
  let firstPlan = await planCampaignSend(campaignId, { batchSize, cursor: resuming ? progress.cursor : null });
  // An exactly full final page needs an empty read; this is completion, not a
  // blocked retry, regardless of whether the separate quiet-hours queue is empty.
  const audienceAlreadyScanned = resuming && firstPlan.blocked === "AUDIENCE_EXHAUSTED";
  if (audienceAlreadyScanned) firstPlan = { ...firstPlan, blocked: undefined, exhausted: true, truncated: false, total: 0, eligible: 0, skipped: 0, reasons: {}, recipients: [], skippedList: [] };
  base.total = firstPlan.total; base.truncated = firstPlan.truncated; base.reasons = { ...firstPlan.reasons };
  if (firstPlan.blocked) {
    await auditBlocked(campaign, firstPlan.blocked, actor, mode, firstPlan);
    const giveUp = resuming && progress.blockedRuns + 1 >= MAX_BLOCKED_RESUMES;
    const lastRun = { ranAt: new Date().toISOString(), mode, blocked: firstPlan.blocked, reasons: firstPlan.reasons, truncated: true };
    await mutateCampaignMetadata(campaignId, (current) => {
      if (leaseIsFresh(leaseFromMetadata(current)) || JSON.stringify(current.sendProgress ?? null) !== observedProgress) return null;
      return { ...current, lastRun, ...(resuming ? { sendProgress: { ...progress, done: false, blockedRuns: progress.blockedRuns + 1, updatedAt: new Date().toISOString() }, sendLease: null } : {}) };
    }, { expectedStatus: campaign.status, ...(giveUp ? { status: "BLOCKED" } : {}) });
    return { ...base, blocked: firstPlan.blocked };
  }
  const lease = newLease(actor);
  if (!resuming) {
    const expected = mode === "SEND_NOW" ? "APPROVED" : "SCHEDULED";
    const metadataClaimed = await mergeCampaignMetadata(campaignId, { sendLease: lease, sendProgress: { ...progress, updatedAt: new Date().toISOString() } }, { expectedStatus: expected, status: "SENDING" });
    if (!metadataClaimed) return { ...base, blocked: "CLAIM_CONFLICT" };
  } else {
    const leaseClaimed = await mutateCampaignMetadata(campaignId, (current) => {
      const currentLease = leaseFromMetadata(current);
      if (leaseIsFresh(currentLease)) return null;
      if (JSON.stringify(current.sendProgress ?? null) !== observedProgress) return null;
      return { ...current, sendLease: lease, sendProgress: { ...progress, updatedAt: new Date().toISOString() } };
    }, { expectedStatus: "SENDING" });
    if (!leaseClaimed) return { ...base, blocked: "ALREADY_RUNNING" };
  }
  base.total = 0; base.reasons = {};
  const runtime = await getActiveCommunicationRuntimeBundle();
  const campaignName = campaign.name;
  const channel = campaign.channel as CommunicationChannelId;
  const templateId = campaign.templateGroupId as string;
  const decisions = coverageDecisions(campaign);
  const purpose = campaign.purpose as CommunicationPurposeId;
  const origin = await resolveAudienceOrigin(campaign.audienceSegmentKey);
  const campaignMetadata = metaOf(campaign);
  const fallbackCandidate = typeof campaignMetadata.fallbackLocale === "string" ? campaignMetadata.fallbackLocale : null;
  const fallbackLocale = (fallbackCandidate && isValidLocale(fallbackCandidate) ? fallbackCandidate : DEFAULT_LOCALE) as SupportedLocale;
  const senderSnapshot = await loadSenderRoutingSnapshot(channel, runtime);
  const whatsapp = channel === "WHATSAPP" ? await loadWhatsappTemplateTruth(templateId) : null;
  const sourceUpdateMeta = sourceUpdateOf(campaign.metadata);
  const updateSource = sourceUpdateMeta ? await loadUpdateSource(sourceUpdateMeta.updateId) : null;
  let providerCalls = 0;
  let lastControlRead = 0;
  let pendingControlRead: Promise<void> | null = null;
  async function checkRunControl() {
    if (Date.now() + 15_000 >= deadline) throw new Error("RUN_TIME_BUDGET_REACHED");
    if (!leaseIsFresh(lease)) throw new Error("CAMPAIGN_LEASE_EXPIRED");
    if (!pendingControlRead || Date.now() - lastControlRead >= 500) {
      lastControlRead = Date.now();
      pendingControlRead = (async () => {
        const live = await getCampaign(campaignId);
        if (!live || live.status !== "SENDING" || leaseOf(live)?.token !== lease.token) throw new Error("CAMPAIGN_STATE_CHANGED");
        const gate = await evaluateCampaignSendControls(live);
        if (!gate.ok) throw new Error("CAMPAIGN_CONTROL_BLOCKED");
      })();
    }
    await pendingControlRead;
  }

  async function runBatch(plan: SendPlan, speedMode: CampaignSpeedMode): Promise<BatchTally> {
    const tally: BatchTally = { total: plan.total, sent: 0, skipped: 0, failed: 0, reasons: {} };
    const batchUserIds = Array.from(new Set([...plan.recipients.map((recipient) => recipient.userId), ...plan.skippedList.map((recipient) => recipient.userId)]));
    const batchEmails = Array.from(new Set(plan.recipients.map((recipient) => String(recipient.email ?? "").trim()).filter(Boolean)));
    const batchPhones = Array.from(new Set(plan.recipients.flatMap((recipient) => phoneMatchVariants(recipient.phone))));
    const existing = batchUserIds.length || batchEmails.length || batchPhones.length ? await prisma.communicationDelivery.findMany({
      where: { campaignId, templateId, channel, origin, OR: [...(batchUserIds.length ? [{ recipientUserId: { in: batchUserIds } }] : []), ...(batchEmails.length ? [{ recipientEmail: { in: batchEmails } }] : []), ...(batchPhones.length ? [{ recipientPhone: { in: batchPhones } }] : [])] },
      select: { recipientUserId: true, recipientEmail: true, recipientPhone: true, status: true, providerMessageId: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }) : [];
    const processedExisting = existing.filter((delivery) => delivery.status && PROCESSED_STATUSES.includes(delivery.status) || !!delivery.providerMessageId);
    const alreadyDone = new Set(processedExisting.map((delivery) => delivery.recipientUserId).filter(Boolean) as string[]);
    const alreadyDoneContacts = new Set(processedExisting.map((delivery) => normalizeRecipientContact(channel, delivery.recipientEmail, delivery.recipientPhone)).filter(Boolean) as string[]);
    const claimedBatchContacts = new Set<string>();
    function recoverOutcome(userId: string, target: BatchTally) {
      const prior = processedExisting.find((delivery) => delivery.recipientUserId === userId);
      if (prior?.status && ACCEPTED_STATUSES.has(prior.status)) target.sent++;
      else if (prior?.status === "SKIPPED" || prior?.status === "CANCELLED" || prior?.status === "UNSUBSCRIBED") target.skipped++;
      else target.failed++;
      bump(target.reasons, "ALREADY_PROCESSED");
    }
    for (const skipped of plan.skippedList) {
      if (alreadyDone.has(skipped.userId)) { recoverOutcome(skipped.userId, tally); continue; }
      await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: skipped.userId, locale: skipped.locale, purpose, origin, createdBy: actor?.actorId ?? null }, skipped.reason);
      tally.skipped++; bump(tally.reasons, skipped.reason);
    }
    const contexts = await loadContextsForUserIds(plan.recipients.map((recipient) => recipient.userId));
    const outcomes = await mapWithConcurrency(plan.recipients, sendConcurrency(channel, speedMode), async (recipient): Promise<BatchTally> => {
      const outcome: BatchTally = { total: 0, sent: 0, skipped: 0, failed: 0, reasons: {} };
      if (Date.now() + 15_000 >= deadline) throw new Error("RUN_TIME_BUDGET_REACHED");
      if (alreadyDone.has(recipient.userId)) { recoverOutcome(recipient.userId, outcome); return outcome; }
      const contactKey = normalizeRecipientContact(channel, recipient.email, recipient.phone);
      if (contactKey && (alreadyDoneContacts.has(contactKey) || claimedBatchContacts.has(contactKey))) {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, recipientEmail: channel === "EMAIL" ? recipient.email : null, recipientPhone: channel !== "EMAIL" ? recipient.phone : null, locale: recipient.locale, purpose, origin, createdBy: actor?.actorId ?? null }, "DUPLICATE_RECIPIENT_CONTACT");
        outcome.skipped++; bump(outcome.reasons, "DUPLICATE_RECIPIENT_CONTACT"); return outcome;
      }
      // Claim synchronously before the first await, then check live controls
      // BEFORE creating a rendered row. Pause must not strand an unsent attempt.
      if (contactKey) claimedBatchContacts.add(contactKey);
      await checkRunControl();
      const loadedCtx = contexts.get(recipient.userId) ?? null;
      const recipientCtx = loadedCtx && updateSource ? { ...loadedCtx, update: updateContextFor(updateSource, recipient.locale, campaignId) } : loadedCtx;
      if (!recipientCtx) {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin }, "CONTEXT_LOAD_FAILED");
        outcome.skipped++; bump(outcome.reasons, "CONTEXT_LOAD_FAILED"); return outcome;
      }
      const rendered = await renderChannelTemplate(channel, templateId, recipient.locale, recipientCtx, fallbackLocale);
      if (!rendered) {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin }, "TEMPLATE_RENDER_FAILED");
        outcome.skipped++; bump(outcome.reasons, "TEMPLATE_RENDER_FAILED"); return outcome;
      }
      if (rendered.usedFallback && decisions[recipient.locale] === "EXCLUDE") {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin, templateName: rendered.templateName }, "LANGUAGE_EXCLUDED");
        outcome.skipped++; bump(outcome.reasons, "LANGUAGE_EXCLUDED"); return outcome;
      }
      const routed = resolveSenderFromSnapshot(senderSnapshot, { locale: recipient.locale, country: recipient.country, purpose });
      const sender = routed.ok ? routed.sender : null;
      const routingReason = routed.ok ? null : routed.reason;
      let to = channel === "EMAIL" ? recipient.email ?? "" : recipient.phone ?? "";
      const decision = resolveProviderForSendWithRuntime(runtime, channel, sender, { country: recipient.country, phone: to });
      const provider = decision.canSend ? decision.providerId : channel === "WHATSAPP" ? "META_WHATSAPP" : channel === "EMAIL" ? EMAIL_PROVIDER_ID : undefined;
      const snapshot = JSON.parse(JSON.stringify(recipientCtx)) as Record<string, unknown>;
      const created = await createDeliveryRecord({ channel, provider: provider as never, campaignId, templateId, templateName: rendered.templateName, recipientUserId: recipient.userId, recipientEmail: channel === "EMAIL" ? recipient.email : null, recipientPhone: channel !== "EMAIL" ? recipient.phone : null, recipientName: recipient.name, locale: recipient.locale, purpose, origin, renderedSubject: rendered.subject, renderedBody: rendered.body, variables: { snapshot }, senderId: sender?.id ?? null, createdBy: actor?.actorId ?? null, status: "RENDERED" });
      if (!created.ok) throw new Error("ARCHIVE_WRITE_FAILED");
      const deliveryId = created.data.id;
      if (!sender && channel !== "SMS") {
        const reason = routingReason ?? "NO_SENDER_AVAILABLE";
        await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: reason });
        outcome.skipped++; bump(outcome.reasons, reason); return outcome;
      }
      let metaName = rendered.templateName, metaLanguage: string = recipient.locale;
      let metaComponents: unknown[] | undefined;
      if (channel === "WHATSAPP") {
        const readiness = whatsapp && sender?.businessAccountId ? resolveVariantForLocale(whatsapp.byWaba.get(sender.businessAccountId) ?? [], recipient.locale, fallbackLocale) : NOT_READY;
        if (!readiness.ready || !readiness.providerTemplateName || !readiness.languageCode) {
          const reason = readiness.reason ?? "META_TEMPLATE_REQUIRED";
          await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: reason });
          outcome.skipped++; bump(outcome.reasons, reason); return outcome;
        }
        const actualMetaCategory = String(readiness.category ?? "").toUpperCase();
        const expectedMetaCategory = purpose === "MARKETING" ? "MARKETING" : purpose === "AUTHENTICATION" ? "AUTHENTICATION" : purpose === "UTILITY" || purpose === "TRANSACTIONAL" ? "UTILITY" : null;
        if (expectedMetaCategory && actualMetaCategory && actualMetaCategory !== expectedMetaCategory) {
          const reason = "META_TEMPLATE_CATEGORY_MISMATCH";
          await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: `${reason}: Meta=${actualMetaCategory}; expected=${expectedMetaCategory}` });
          outcome.skipped++; bump(outcome.reasons, reason); return outcome;
        }
        const built = buildMetaComponents({ componentsSchema: readiness.componentsSchema, values: templateValuesFor(whatsapp?.positionalNames ?? [], recipientCtx), positionalNames: whatsapp?.positionalNames ?? [], scopedNames: whatsapp?.scopedNames ?? {}, headerMediaUrl: whatsapp?.headerMediaUrl ?? null, headerMediaFilename: whatsapp?.headerMediaFilename ?? null, headerLocation: whatsapp?.headerLocation ?? null });
        if (!built.ok) {
          await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: `${built.reason}  ${built.detail}` });
          outcome.skipped++; bump(outcome.reasons, built.reason); return outcome;
        }
        metaName = readiness.providerTemplateName; metaLanguage = readiness.languageCode; metaComponents = built.components;
        await updateDeliveryVariables(deliveryId, { snapshot, whatsappPreview: buildWhatsappRenderedPreview({ componentsSchema: readiness.componentsSchema, builtComponents: built.components, fallbackBody: rendered.body, providerTemplateName: readiness.providerTemplateName, languageCode: readiness.languageCode }) });
      }
      const executionCheck = await checkCampaignRecipientBeforeSend(channel, recipient.userId, to);
      if (!executionCheck.ok) {
        await markDeliveryStatus(deliveryId, executionCheck.unavailable ? "FAILED" : "SKIPPED", { errorMessage: executionCheck.reason });
        if (executionCheck.unavailable) outcome.failed++; else outcome.skipped++;
        bump(outcome.reasons, executionCheck.reason); return outcome;
      }
      to = executionCheck.contact;
      let result: Awaited<ReturnType<typeof sendPreparedDelivery>>;
      try {
        providerCalls++;
        result = await sendPreparedDelivery({ channel, sender, country: recipient.country, to, templateName: metaName, languageCode: metaLanguage, components: metaComponents, subject: rendered.subject, html: rendered.body, purpose, locale: recipient.locale, channelName: campaignName }, runtime);
      } catch {
        await markDeliveryStatus(deliveryId, "FAILED", { errorMessage: "DELIVERY_OUTCOME_UNCERTAIN" });
        outcome.failed++; bump(outcome.reasons, "DELIVERY_OUTCOME_UNCERTAIN"); return outcome;
      }
      if (!result.ok) {
        const terminal = result.reason.endsWith("_NOT_CONFIGURED") || result.reason.endsWith("_NOT_IMPLEMENTED") || result.reason === "EMAIL_SUPPRESSED" || result.reason.includes("SENDER_MISSING") || result.reason === "PROVIDER_DISABLED" || result.reason === "INTEGRATION_DECRYPTION_FAILED" || result.reason === "INTEGRATION_DATABASE_UNAVAILABLE";
        await markDeliveryStatus(deliveryId, terminal ? "SKIPPED" : "FAILED", { errorMessage: result.detail ? `${result.reason}  ${result.detail}` : result.reason });
        if (terminal) outcome.skipped++; else outcome.failed++;
        bump(outcome.reasons, result.reason); return outcome;
      }
      await markDeliveryStatus(deliveryId, "SENT", { providerMessageId: result.providerMessageId, internalAccepted: result.internalAccepted });
      outcome.sent++; bump(outcome.reasons, "SENT"); return outcome;
    });
    for (const outcome of outcomes) mergeBatchTally(tally, outcome);
    return tally;
  }

  let plan: SendPlan | null = audienceAlreadyScanned ? null : firstPlan;
  let batches = 0, exhausted = audienceAlreadyScanned;
  let cursor = progress.cursor;
  while (plan && batches < maxBatches) {
    if (Date.now() + 15_000 >= deadline) { base.blocked = "RUN_TIME_BUDGET_REACHED"; break; }
    const liveCampaign = await getCampaign(campaignId);
    if (!liveCampaign || liveCampaign.status !== "SENDING" || leaseOf(liveCampaign)?.token !== lease.token) throw new Error("CAMPAIGN_STATE_CHANGED");
    const liveGate = await evaluateCampaignSendControls(liveCampaign);
    if (!liveGate.ok) { base.blocked = liveGate.reason; break; }
    const quietSlice = await queueRecipientQuietHours(campaignId, plan, liveGate.controls);
    plan = quietSlice.plan;
    const remainingRecipients = Math.max(plan.audienceTotal - progress.total, plan.total);
    const liveSpeed = liveGate.controls.autoSpeed ? autoSpeedMode({ remainingRecipients, remainingDaily: liveGate.remainingDaily, scheduledStopAt: liveGate.controls.scheduledStopAt }) : liveGate.controls.speedMode;
    const tally = await runBatch(plan, liveSpeed);
    batches++; exhausted = plan.exhausted; cursor = plan.nextCursor;
    base.total += tally.total; base.sent += tally.sent; base.skipped += tally.skipped; base.failed += tally.failed;
    for (const [key, value] of Object.entries(tally.reasons)) base.reasons[key] = (base.reasons[key] ?? 0) + value;
    progress.cursor = cursor; progress.batches++; progress.total += tally.total; progress.sent += tally.sent; progress.skipped += tally.skipped; progress.failed += tally.failed;
    for (const [key, value] of Object.entries(tally.reasons)) progress.reasons[key] = (progress.reasons[key] ?? 0) + value;
    // Only the final status+metadata CAS may set done=true. A crash between a
    // page checkpoint and finalization must remain resumable.
    progress.updatedAt = new Date().toISOString(); progress.done = false; progress.blockedRuns = 0;
    lease.expiresAt = new Date(Date.now() + LEASE_MS).toISOString();
    await patchMetadata(campaignId, { sendProgress: { ...progress }, sendLease: lease }, lease.token);
    if (exhausted || batches >= maxBatches) break;
    const fresh = await getCampaign(campaignId);
    if (!fresh) throw new Error("CAMPAIGN_STATE_UNAVAILABLE");
    const nextGate = await evaluateCampaignSendControls(fresh);
    if (!nextGate.ok) { base.blocked = nextGate.reason; break; }
    const nextMode = nextGate.controls.autoSpeed ? autoSpeedMode({ remainingRecipients: Math.max(firstPlan.audienceTotal - progress.total, 0), remainingDaily: nextGate.remainingDaily, scheduledStopAt: nextGate.controls.scheduledStopAt }) : nextGate.controls.speedMode;
    const desiredNextBatch = Math.min(opts.batchSize ?? speedSettings(nextMode).batchSize, 1000);
    const next = await planCampaignSend(campaignId, { batchSize: Math.max(1, Math.min(desiredNextBatch, nextGate.remainingDaily ?? desiredNextBatch)), cursor });
    if (next.blocked) { if (next.blocked === "AUDIENCE_EXHAUSTED") exhausted = true; else base.blocked = next.blocked; break; }
    plan = next; base.truncated = next.truncated;
  }
  if (exhausted && batches < maxBatches && Date.now() + 15_000 < deadline) {
    const fresh = await getCampaign(campaignId);
    if (!fresh || fresh.status !== "SENDING" || leaseOf(fresh)?.token !== lease.token) throw new Error("CAMPAIGN_STATE_CHANGED");
    const liveGate = await evaluateCampaignSendControls(fresh);
    if (liveGate.ok) {
      const modeForDeferred = liveGate.controls.autoSpeed ? autoSpeedMode({ remainingRecipients: await countDeferredQuietRecipients(campaignId), remainingDaily: liveGate.remainingDaily, scheduledStopAt: liveGate.controls.scheduledStopAt }) : liveGate.controls.speedMode;
      const deferredBatchSize = Math.max(1, Math.min(speedSettings(modeForDeferred).batchSize, liveGate.remainingDaily ?? 1000, 1000));
      const due = await loadDueQuietRecipients(campaignId, liveGate.controls, deferredBatchSize);
      if (due.recipients.length) {
        const deferredPlan: SendPlan = { campaignId, channel, status: "SENDING", total: due.recipients.length, audienceTotal: Math.max(firstPlan.audienceTotal, progress.total), eligible: due.recipients.length, skipped: 0, reasons: {}, coverage: { ok: true, undecided: [] }, providerReady: true, senderReady: true, willSend: true, truncated: false, nextCursor: cursor, exhausted: true, recipients: due.recipients, skippedList: [] };
        const tally = await runBatch(deferredPlan, modeForDeferred);
        await prisma.communicationCampaignDeferredRecipient.deleteMany({ where: { id: { in: due.queueIds } } });
        batches++; base.sent += tally.sent; base.skipped += tally.skipped; base.failed += tally.failed;
        for (const [key, value] of Object.entries(tally.reasons)) { base.reasons[key] = (base.reasons[key] ?? 0) + value; progress.reasons[key] = (progress.reasons[key] ?? 0) + value; }
        progress.sent += tally.sent; progress.skipped += tally.skipped; progress.failed += tally.failed; progress.batches++; progress.updatedAt = new Date().toISOString(); progress.blockedRuns = 0;
      }
    } else base.blocked = liveGate.reason;
  }
  const deferredRemaining = await countDeferredQuietRecipients(campaignId);
  const hasMore = !exhausted || deferredRemaining > 0;
  progress.done = !hasMore;
  const finalStatus = hasMore ? "SENDING" : computeFinalStatus(progress.total, progress.sent, progress.skipped, progress.failed);
  base.truncated = hasMore;
  const finalized = await mutateCampaignMetadata(campaignId, (current) => {
    if (leaseFromMetadata(current)?.token !== lease.token) return null;
    return { ...current, sendProgress: { ...progress }, sendLease: null, lastRun: { ranAt: new Date().toISOString(), mode, batches, total: progress.total, sent: progress.sent, skipped: progress.skipped, failed: progress.failed, blocked: base.blocked ?? null, reasons: progress.reasons, truncated: hasMore, hasMore } };
  }, { status: finalStatus, expectedStatus: "SENDING" });
  if (!finalized) throw new Error("CAMPAIGN_STATE_CHANGED");
  const counters = await recomputeCampaignCounters(campaignId);
  await writeAuditLog({ actorId: actor?.actorId ?? undefined, actorName: actor?.actorName ?? undefined, actorRole: actor?.actorRole ?? "ADMIN", action: "communication.campaign.send", messageAr: hasMore ? `تنفيذ دفعة من حملة «${campaign.name}» (المتابعة مجدولة)` : `اكتمل فحص جمهور حملة «${campaign.name}»؛ راجع نتائج التسليم`, messageEn: hasMore ? `Campaign batch executed: ${campaign.name} (will continue)` : `Campaign audience processed: ${campaign.name}`, entityType: "CommunicationCampaign", entityId: campaignId, metadata: { mode, batches, sent: base.sent, skipped: base.skipped, failed: base.failed, cumulative: { sent: progress.sent, skipped: progress.skipped, failed: progress.failed }, hasMore, truncated: hasMore, externalCall: providerCalls > 0, providerCalls }, stream: "TEAM" });
  base.ok = counters.ok; base.status = counters.ok ? counters.status : finalStatus; base.batches = batches; base.hasMore = hasMore;
  if (!counters.ok) base.blocked = "COUNTERS_UPDATE_FAILED";
  return base;
}

/** One bounded scheduler tick; a failed campaign cannot erase other results. */
export async function runDueCampaigns(opts: { actor?: Actor; max?: number; maxBatchesPerCampaign?: number } = {}): Promise<ExecutionSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const max = Math.max(1, Math.min(opts.max ?? 10, 50));
  const maxBatchesPerCampaign = Math.max(1, Math.min(opts.maxBatchesPerCampaign ?? 1, DEFAULT_MAX_BATCHES));
  const deadline = Date.now() + RUN_BUDGET_MS;
  const results: ExecutionSummary[] = [];
  const dueCandidates = await prisma.communicationCampaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, select: { id: true, metadata: true, scheduledAt: true }, take: Math.min(max * 5, 250) });
  dueCandidates.sort((a, b) => campaignPriorityRank(campaignSendControls(a as Pick<CommunicationCampaign, "metadata">).priority) - campaignPriorityRank(campaignSendControls(b as Pick<CommunicationCampaign, "metadata">).priority) || (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0));
  const due = dueCandidates.slice(0, max);
  for (const campaign of due) {
    if (Date.now() + 15_000 >= deadline) break;
    results.push(await executeCampaignSend(campaign.id, { actor: opts.actor, mode: "DUE", maxBatches: maxBatchesPerCampaign, timeBudgetMs: deadline - Date.now() }));
  }
  const budget = max - results.length;
  if (budget > 0 && Date.now() + 15_000 < deadline) {
    const inFlight = await prisma.communicationCampaign.findMany({ where: { status: "SENDING" }, select: { id: true, metadata: true, updatedAt: true }, take: Math.min(budget * 8, 250) });
    inFlight.sort((a, b) => campaignPriorityRank(campaignSendControls(a as Pick<CommunicationCampaign, "metadata">).priority) - campaignPriorityRank(campaignSendControls(b as Pick<CommunicationCampaign, "metadata">).priority) || a.updatedAt.getTime() - b.updatedAt.getTime());
    for (const row of inFlight) {
      if (results.length >= max || Date.now() + 15_000 >= deadline) break;
      if (results.some((result) => result.campaignId === row.id)) continue;
      const asCampaign = row as unknown as CommunicationCampaign;
      const progress = progressOf(asCampaign);
      if (!progress || progress.done || leaseIsFresh(leaseOf(asCampaign))) continue;
      results.push(await executeCampaignSend(row.id, { actor: opts.actor, mode: "RESUME", maxBatches: maxBatchesPerCampaign, timeBudgetMs: deadline - Date.now() }));
    }
  }
  return results;
}
