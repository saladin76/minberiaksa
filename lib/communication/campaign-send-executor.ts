import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { CommunicationCampaign } from "@prisma/client";
import { getCampaign } from "./campaign-service";
import { planCampaignSend, type SendPlan } from "./campaign-send-planner";
import { renderChannelTemplate } from "./template-compat";
import { loadContextsForUserIds } from "@/lib/templates/variables";
import { loadUpdateSource, sourceUpdateOf, updateContextFor } from "./update-campaign";
import { createDeliveryRecord, recordSkippedDelivery, markDeliveryStatus } from "./delivery-log-service";
import { resolveProviderForSendWithRuntime, sendPreparedDelivery } from "./provider-router";
import { EMAIL_PROVIDER_ID } from "./providers/email/client";
import { getActiveCommunicationRuntimeBundle } from "./runtime-config";
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot } from "./sender-resolution";
import { resolveVariantForLocale, NOT_READY, META_PROVIDER } from "./whatsapp-template-sync";
import { buildMetaComponents } from "./providers/meta-whatsapp/parameters";
import { resolveAudienceOrigin } from "./audience-list-service";
import { computeFinalStatus, recomputeCampaignCounters } from "./campaign-counter-service";
import { type CommunicationChannelId, type CommunicationPurposeId } from "./communication-runtime-types";
import { autoSpeedMode, campaignPriorityRank, campaignSendControls, evaluateCampaignSendControls, insideQuietHours, speedSettings, type CampaignSpeedMode, type CampaignSendControls } from "./campaign-send-controls";
import { mergeCampaignMetadata, mutateCampaignMetadata } from "./campaign-metadata-store";
import { normalizePhoneE164, phoneMatchVariants } from "./phone";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import { recipientTimeZone } from "./recipient-timezone";

export { computeFinalStatus };

function recipientQuietHoursSlice(plan: SendPlan, controls: CampaignSendControls): { plan: SendPlan | null; blocked: boolean } {
  if (!controls.quietHours.enabled || controls.quietHours.timezoneMode !== "RECIPIENT") {
    return { plan, blocked: false };
  }

  const now = new Date();
  const orderedRecipients = [...plan.recipients].sort((a, b) => a.cursorId.localeCompare(b.cursorId));
  const firstQuiet = orderedRecipients.find((recipient) => {
    const zone = recipientTimeZone(
      { country: recipient.country, phone: recipient.phone },
      controls.quietHours.timezone,
    );
    return insideQuietHours(controls, now, zone);
  });
  if (!firstQuiet) return { plan, blocked: false };

  // Stop immediately before the first recipient whose local clock is quiet. The cursor is the
  // underlying audience cursor (donor id for smart/global audiences, list-member id for saved
  // audiences), so this works for every audience type without dropping a recipient.
  const beforeRecipients = plan.recipients.filter((recipient) => recipient.cursorId < firstQuiet.cursorId);
  const beforeSkipped = plan.skippedList.filter((recipient) => recipient.cursorId < firstQuiet.cursorId);
  const ids = [
    ...beforeRecipients.map((recipient) => recipient.cursorId),
    ...beforeSkipped.map((recipient) => recipient.cursorId),
  ].sort();

  if (!ids.length) return { plan: null, blocked: true };
  const cutoff = ids[ids.length - 1]!;
  const reasons: Record<string, number> = {};
  for (const item of beforeSkipped) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;

  return {
    blocked: false,
    plan: {
      ...plan,
      recipients: beforeRecipients,
      skippedList: beforeSkipped,
      total: beforeRecipients.length + beforeSkipped.length,
      eligible: beforeRecipients.length,
      skipped: beforeSkipped.length,
      reasons,
      nextCursor: cutoff,
      exhausted: false,
      truncated: true,
    },
  };
}

/** Meta truth for one template, partitioned by WABA so routing and approval can never disagree. */
async function loadWhatsappTemplateTruth(templateId: string): Promise<{
  byWaba: Map<string, Parameters<typeof resolveVariantForLocale>[0]>;
  positionalNames: string[];
  scopedNames: Record<string, string>;
  headerMediaUrl: string | null;
  headerMediaFilename: string | null;
  headerLocation: { latitude: number; longitude: number; name?: string; address?: string } | null;
}> {
  const [variants, tpl] = await Promise.all([
    prisma.whatsappTemplateWabaVariant.findMany({
      where: { templateId, provider: META_PROVIDER },
      select: {
        businessAccountId: true,
        languageCode: true,
        locale: true,
        approvalStatus: true,
        category: true,
        providerTemplateName: true,
        componentsSchema: true,
        rejectionReason: true,
        lastSyncedAt: true,
      },
    }).catch(() => []),
    prisma.whatsappTemplate.findUnique({ where: { id: templateId }, select: { variables: true, header: true } }).catch(() => null),
  ]);
  const byWaba = new Map<string, Parameters<typeof resolveVariantForLocale>[0]>();
  for (const row of variants) {
    const list = byWaba.get(row.businessAccountId) ?? [];
    list.push(row);
    byWaba.set(row.businessAccountId, list);
  }
  const catalog = Array.isArray(tpl?.variables) ? (tpl!.variables as unknown[]) : [];
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

  const header = tpl?.header && typeof tpl.header === "object"
    ? (tpl.header as Record<string, unknown>)
    : {};
  const headerMediaUrl = typeof header.mediaUrl === "string" && header.mediaUrl.trim() ? header.mediaUrl.trim() : null;
  const headerMediaFilename = typeof header.fileName === "string" && header.fileName.trim() ? header.fileName.trim() : null;
  const latitude = Number(header.latitude);
  const longitude = Number(header.longitude);
  const headerLocation = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? {
        latitude,
        longitude,
        ...(typeof header.name === "string" && header.name.trim() ? { name: header.name.trim() } : {}),
        ...(typeof header.address === "string" && header.address.trim() ? { address: header.address.trim() } : {}),
      }
    : null;

  return { byWaba, positionalNames, scopedNames, headerMediaUrl, headerMediaFilename, headerLocation };
}

/**
 * Placeholder values for one recipient, from the same context the body was rendered with.
 *
 * Variable keys are dotted paths into that context (`user.name`, `donation.amount`). Each value is
 * stored under its name and under its position, so the component builder finds it either way.
 */
function templateValuesFor(names: string[], ctx: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  names.forEach((name, index) => {
    let node: unknown = ctx;
    for (const key of name.split(".")) {
      if (!node || typeof node !== "object") { node = undefined; break; }
      node = (node as Record<string, unknown>)[key];
    }
    if (typeof node !== "string" && typeof node !== "number") return;
    out[name] = String(node);
    out[String(index + 1)] = String(node);
  });
  return out;
}

/**
 * Campaign sending, as a resumable walk over the audience.
 *
 * A single run cannot send to everyone: the request has a time budget and the providers have rate
 * limits, so the audience is walked in batches. What matters is that the walk *finishes*. It used to
 * not: one batch was processed, a final status was written, and a campaign with 3,000 recipients
 * reported itself SENT after 200  the remaining 2,800 were never contacted and nothing in the
 * record said so.
 *
 * So the run keeps a position. `sendProgress` on the campaign holds the cursor into the audience
 * plus the tallies so far; each batch advances the cursor and adds to the tallies; the campaign only
 * leaves SENDING for a final status once the audience reports itself exhausted. Until then the
 * scheduler picks it back up (`runDueCampaigns`) and continues where the last run stopped, so
 * completeness does not depend on any one request surviving.
 *
 * Two things keep concurrent runners apart:
 *
 *  · the first batch claims the campaign by an atomic status transition (APPROVED/SCHEDULED →
 *    SENDING). Only one runner can win that, so a double-clicked Send cannot start two walks.
 *  · a resume takes a short lease (`sendLease`) before continuing, and a fresh lease held by someone
 *    else is refused. A lease that has expired is treated as a crashed run and taken over, which is
 *    what makes a killed request recoverable rather than a stuck campaign.
 *
 * Per recipient, the batch also skips anyone who already has a processed delivery for this
 * campaign+template  that is the backstop behind both of the above, and the reason a re-run is safe
 * even if a lease were somehow shared.
 */

const PROCESSED_STATUSES = ["RENDERED", "QUEUED", "SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"];
type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;
export type SendMode = "SEND_NOW" | "DUE" | "RESUME";
export type ExecutionSummary = {
  ok: boolean; campaignId: string; status: string; total: number; sent: number; skipped: number; failed: number;
  truncated: boolean; reasons: Record<string, number>; blocked?: string;
  /** Batches processed by THIS run. */
  batches?: number;
  /** True when the audience still has recipients left  the scheduler will continue. */
  hasMore?: boolean;
};

/** How long a resuming runner holds the campaign before another may take it over as crashed. */
const LEASE_MS = 5 * 60 * 1000;
/** Batches per run. Bounded so a single request stays inside its time budget; the rest is the scheduler's. */
const DEFAULT_MAX_BATCHES = 5;

/** The walk's position and running totals, persisted on the campaign between runs. */
type SendProgress = {
  cursor: string | null;
  batches: number;
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  reasons: Record<string, number>;
  startedAt: string;
  updatedAt: string;
  done: boolean;
  /** Consecutive resumes that could not run at all (provider gone, template deleted). */
  blockedRuns: number;
};

/**
 * How many consecutive blocked resumes before the walk is given up on. A provider outage should be
 * waited out  that is the point of resuming  but a permanently broken campaign must stop asking
 * the scheduler every ten minutes and must stop looking "in progress" to whoever is watching.
 */
const MAX_BLOCKED_RESUMES = 3;

type Lease = { token: string; expiresAt: string; holder?: string | null };

function bump(reasons: Record<string, number>, key: string) { reasons[key] = (reasons[key] ?? 0) + 1; }

function normalizeRecipientContact(channel: CommunicationChannelId, email: string | null | undefined, phone: string | null | undefined): string | null {
  if (channel === "EMAIL") {
    const value = String(email ?? "").trim().toLowerCase();
    return value ? `email:${value}` : null;
  }
  const canonical = normalizePhoneE164(phone);
  return canonical ? `phone:${canonical}` : null;
}
function metaOf(campaign: CommunicationCampaign) { return (campaign.metadata as Record<string, unknown> | null) ?? {}; }
function coverageDecisions(campaign: CommunicationCampaign): Record<string, string> { return (metaOf(campaign).coverageDecisions ?? {}) as Record<string, string>; }
function progressOf(campaign: CommunicationCampaign): SendProgress | null {
  const raw = metaOf(campaign).sendProgress as Partial<SendProgress> | undefined;
  if (!raw || typeof raw !== "object") return null;
  return {
    cursor: typeof raw.cursor === "string" ? raw.cursor : null,
    batches: Number(raw.batches) || 0,
    total: Number(raw.total) || 0,
    sent: Number(raw.sent) || 0,
    skipped: Number(raw.skipped) || 0,
    failed: Number(raw.failed) || 0,
    reasons: (raw.reasons && typeof raw.reasons === "object" ? raw.reasons : {}) as Record<string, number>,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    done: raw.done === true,
    blockedRuns: Number(raw.blockedRuns) || 0,
  };
}
function leaseOf(campaign: CommunicationCampaign): Lease | null {
  const raw = metaOf(campaign).sendLease as Partial<Lease> | undefined;
  if (!raw || typeof raw.token !== "string" || typeof raw.expiresAt !== "string") return null;
  return { token: raw.token, expiresAt: raw.expiresAt, holder: raw.holder ?? null };
}
function leaseIsFresh(lease: Lease | null): boolean {
  if (!lease) return false;
  const expires = Date.parse(lease.expiresAt);
  return Number.isFinite(expires) && expires > Date.now();
}
function newLease(actor: Actor): Lease {
  return { token: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, expiresAt: new Date(Date.now() + LEASE_MS).toISOString(), holder: actor?.actorName ?? actor?.actorRole ?? null };
}

/** Merge into the latest campaign metadata without overwriting live operator controls. */
async function patchMetadata(campaignId: string, patch: Record<string, unknown>) {
  await mergeCampaignMetadata(campaignId, patch);
}

async function auditBlocked(campaign: CommunicationCampaign, reason: string, actor: Actor, mode: SendMode, plan?: SendPlan) {
  await writeAuditLog({ actorId: actor?.actorId ?? undefined, actorName: actor?.actorName ?? undefined, actorRole: actor?.actorRole ?? "ADMIN", action: "communication.campaign.send.blocked", messageAr: `تعذّر إرسال حملة «${campaign.name}»  السبب: ${reason}`, messageEn: `Campaign send blocked: ${campaign.name}  ${reason}`, entityType: "CommunicationCampaign", entityId: campaign.id, metadata: { mode, reason, summary: plan ? { total: plan.total, eligible: plan.eligible, skipped: plan.skipped, reasons: plan.reasons } : undefined, externalCall: false, autoSend: false }, stream: "TEAM" });
}

/** Tallies for one batch, added into the run's and the campaign's running totals. */
type BatchTally = { total: number; sent: number; skipped: number; failed: number; reasons: Record<string, number> };

function concurrencyFromEnv(name: string, fallback: number, cap = 50): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), cap);
}

function sendConcurrency(channel: CommunicationChannelId, speedMode: CampaignSpeedMode = "BALANCED"): number {
  const speed = speedSettings(speedMode);
  if (channel === "WHATSAPP") return concurrencyFromEnv("COMMUNICATION_WHATSAPP_CONCURRENCY", speed.concurrency);
  if (channel === "EMAIL") return concurrencyFromEnv("COMMUNICATION_EMAIL_CONCURRENCY", Math.max(speed.concurrency, 20));
  return concurrencyFromEnv("COMMUNICATION_SMS_CONCURRENCY", speed.concurrency);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const output = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function mergeBatchTally(target: BatchTally, source: BatchTally) {
  target.sent += source.sent;
  target.skipped += source.skipped;
  target.failed += source.failed;
  for (const [key, value] of Object.entries(source.reasons)) {
    target.reasons[key] = (target.reasons[key] ?? 0) + value;
  }
}

export async function executeCampaignSend(
  campaignId: string,
  opts: { actor?: Actor; mode?: SendMode; batchSize?: number; maxBatches?: number } = {},
): Promise<ExecutionSummary> {
  const mode = opts.mode ?? "SEND_NOW";
  const maxBatches = Math.max(1, Math.min(opts.maxBatches ?? DEFAULT_MAX_BATCHES, 50));
  const actor = opts.actor ?? null;
  const base: ExecutionSummary = { ok: false, campaignId, status: "", total: 0, sent: 0, skipped: 0, failed: 0, truncated: false, reasons: {}, batches: 0 };
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ...base, blocked: "NOT_FOUND" };
  base.status = campaign.status;

  // Intentional campaign controls are checked before planning/claiming, so a paused campaign or a
  // quiet-hours wait never increments the "broken provider" retry counter and can resume forever.
  const controlGate = await evaluateCampaignSendControls(campaign);
  if (!controlGate.ok) return { ...base, blocked: controlGate.reason };
  const speed = speedSettings(controlGate.controls.speedMode);
  const requestedBatch = Math.min(opts.batchSize ?? speed.batchSize, 1000);
  const batchSize = Math.max(1, Math.min(requestedBatch, controlGate.remainingDaily ?? requestedBatch));

  /* ── Gate + claim ──────────────────────────────────────────────────────
     The claim is an atomic status transition, so two runners cannot both start
     the walk. A resume has no transition to ride on and uses the lease. */
  if (mode === "SEND_NOW" || mode === "DUE") {
    if (mode === "SEND_NOW" && campaign.status !== "APPROVED") { await auditBlocked(campaign, "NOT_APPROVED", actor, mode); return { ...base, blocked: "NOT_APPROVED" }; }
    if (mode === "DUE" && (campaign.status !== "SCHEDULED" || !campaign.scheduledAt || campaign.scheduledAt.getTime() > Date.now())) {
      const reason = campaign.status !== "SCHEDULED" ? "NOT_SCHEDULED" : "NOT_DUE";
      await auditBlocked(campaign, reason, actor, mode);
      return { ...base, blocked: reason };
    }
  } else if (campaign.status !== "SENDING") {
    return { ...base, blocked: "NOT_RESUMABLE" };
  } else {
    const existingProgress = progressOf(campaign);
    if (existingProgress?.done) return { ...base, blocked: "ALREADY_COMPLETE" };
    if (leaseIsFresh(leaseOf(campaign))) return { ...base, blocked: "ALREADY_RUNNING" };
  }

  /* The plan is computed before the claim so a blocked campaign is not left parked in SENDING. */
  const resuming = mode === "RESUME";
  const progress: SendProgress = progressOf(campaign) ?? {
    cursor: null, batches: 0, total: 0, sent: 0, skipped: 0, failed: 0, reasons: {},
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), done: false, blockedRuns: 0,
  };

  const firstPlan = await planCampaignSend(campaignId, { batchSize, cursor: resuming ? progress.cursor : null });
  base.total = firstPlan.total; base.truncated = firstPlan.truncated; base.reasons = { ...firstPlan.reasons };
  if (firstPlan.blocked) {
    await auditBlocked(campaign, firstPlan.blocked, actor, mode, firstPlan);
    /* A mid-walk campaign that cannot run is left resumable so a provider outage can be waited out 
       but not forever: after MAX_BLOCKED_RESUMES it is finalised from the tallies it did reach, so it
       stops asking the scheduler every tick and stops reading as "sending" to whoever is watching. */
    const giveUp = resuming && progress.blockedRuns + 1 >= MAX_BLOCKED_RESUMES;
    if (resuming) {
      progress.blockedRuns += 1;
      progress.updatedAt = new Date().toISOString();
      if (giveUp) progress.done = true;
    }
    const lastRun = { ranAt: new Date().toISOString(), mode, total: firstPlan.total, sent: 0, skipped: firstPlan.skipped, failed: 0, blocked: firstPlan.blocked, reasons: firstPlan.reasons, truncated: firstPlan.truncated, gaveUp: giveUp || undefined };
    if (giveUp) {
      await mutateCampaignMetadata(
        campaignId,
        (current) => ({ ...current, sendProgress: { ...progress }, sendLease: null, lastRun }),
        { status: computeFinalStatus(progress.total, progress.sent, progress.skipped, progress.failed), expectedStatus: "SENDING" },
      );
    } else {
      await patchMetadata(campaignId, { lastRun, sendLease: null, ...(resuming ? { sendProgress: { ...progress } } : {}) });
    }
    return { ...base, blocked: firstPlan.blocked };
  }

  const lease = newLease(actor);
  if (!resuming) {
    const expected = mode === "SEND_NOW" ? "APPROVED" : "SCHEDULED";
    const claimed = await prisma.communicationCampaign
      .updateMany({ where: { id: campaignId, status: expected }, data: { status: "SENDING" } })
      .catch(() => ({ count: 0 }));
    if (!claimed.count) return { ...base, blocked: "ALREADY_RUNNING" };

    const metadataClaimed = await mergeCampaignMetadata(
      campaignId,
      { sendLease: lease, sendProgress: { ...progress, updatedAt: new Date().toISOString() } },
      { expectedStatus: "SENDING" },
    );
    if (!metadataClaimed) {
      await prisma.communicationCampaign
        .updateMany({ where: { id: campaignId, status: "SENDING" }, data: { status: expected } })
        .catch(() => ({ count: 0 }));
      return { ...base, blocked: "CLAIM_CONFLICT" };
    }
  } else {
    // Resume lease acquisition must be atomic. Two scheduler ticks may both observe an expired
    // lease; only one is allowed to replace it. The metadata CAS re-reads the latest lease on
    // every retry and refuses if another runner has already claimed the campaign.
    const leaseClaimed = await mutateCampaignMetadata(
      campaignId,
      (current) => {
        const raw = current.sendLease as Partial<Lease> | null | undefined;
        const currentLease =
          raw && typeof raw.token === "string" && typeof raw.expiresAt === "string"
            ? { token: raw.token, expiresAt: raw.expiresAt, holder: raw.holder ?? null }
            : null;
        if (leaseIsFresh(currentLease)) return null;
        return {
          ...current,
          sendLease: lease,
          sendProgress: { ...progress, updatedAt: new Date().toISOString() },
        };
      },
      { expectedStatus: "SENDING" },
    );
    if (!leaseClaimed) return { ...base, blocked: "ALREADY_RUNNING" };
  }

  /* ── Everything the batches share, resolved once ───────────────────── */
  const runtime = await getActiveCommunicationRuntimeBundle();
  const campaignName = campaign.name;
  const channel = campaign.channel as CommunicationChannelId;
  const templateId = campaign.templateGroupId as string;
  const decisions = coverageDecisions(campaign);
  const purpose = campaign.purpose as CommunicationPurposeId;
  const origin = await resolveAudienceOrigin(campaign.audienceSegmentKey);
  const campaignMetadata = campaign.metadata && typeof campaign.metadata === "object"
    ? campaign.metadata as Record<string, unknown>
    : {};
  const fallbackCandidate = typeof campaignMetadata.fallbackLocale === "string" ? campaignMetadata.fallbackLocale : null;
  const fallbackLocale = (fallbackCandidate && isValidLocale(fallbackCandidate) ? fallbackCandidate : DEFAULT_LOCALE) as SupportedLocale;
  const senderSnapshot = await loadSenderRoutingSnapshot(channel, runtime);
  /* WhatsApp template truth, read once for the whole run: which languages Meta approved, and what
     parameters each of those variants takes. Reading it per recipient would be thousands of queries
     for one answer that cannot change mid-batch. */
  const whatsapp = channel === "WHATSAPP" ? await loadWhatsappTemplateTruth(templateId) : null;
  /* A campaign created from a campaign update carries it in metadata: read
     once (all its translations), then handed to each recipient in their own
     language as the {{update.*}} variables. A deleted update leaves them empty
     and the template's update blocks are dropped rather than sent blank. */
  const sourceUpdateMeta = sourceUpdateOf(campaign.metadata);
  const updateSource = sourceUpdateMeta ? await loadUpdateSource(sourceUpdateMeta.updateId).catch(() => null) : null;

  /** One batch: archive its skips, render, route and send each eligible recipient. */
  async function runBatch(plan: SendPlan, speedMode: CampaignSpeedMode): Promise<BatchTally> {
    const tally: BatchTally = { total: plan.total, sent: 0, skipped: 0, failed: 0, reasons: {} };

    /*
     * Idempotency guard, scoped to THIS page of the audience.
     *
     * The previous query loaded every delivery ever written for the campaign before every batch.
     * On a 20k-donor campaign that meant repeatedly scanning and transferring thousands of historic
     * rows just to learn whether the next 200 recipients were already handled. Restricting the query
     * to the current page keeps the work proportional to batch size while preserving the same
     * double-send protection.
     */
    const batchUserIds = Array.from(new Set([
      ...plan.recipients.map((recipient) => recipient.userId),
      ...plan.skippedList.map((recipient) => recipient.userId),
    ]));
    const batchEmails = Array.from(new Set(
      plan.recipients
        .map((recipient) => String(recipient.email ?? "").trim())
        .filter(Boolean),
    ));
    const batchPhones = Array.from(new Set(
      plan.recipients.flatMap((recipient) => phoneMatchVariants(recipient.phone)),
    ));
    const existing = (batchUserIds.length || batchEmails.length || batchPhones.length)
      ? await prisma.communicationDelivery.findMany({
          where: {
            campaignId,
            templateId,
            channel,
            origin,
            OR: [
              ...(batchUserIds.length ? [{ recipientUserId: { in: batchUserIds } }] : []),
              ...(batchEmails.length ? [{ recipientEmail: { in: batchEmails } }] : []),
              ...(batchPhones.length ? [{ recipientPhone: { in: batchPhones } }] : []),
            ],
          },
          select: {
            recipientUserId: true,
            recipientEmail: true,
            recipientPhone: true,
            status: true,
            providerMessageId: true,
          },
        }).catch(() => [])
      : [];
    const processedExisting = existing.filter(
      (delivery) => (delivery.status && PROCESSED_STATUSES.includes(delivery.status)) || !!delivery.providerMessageId,
    );
    const alreadyDone = new Set(
      processedExisting
        .map((delivery) => delivery.recipientUserId)
        .filter(Boolean) as string[],
    );
    const alreadyDoneContacts = new Set(
      processedExisting
        .map((delivery) => normalizeRecipientContact(channel, delivery.recipientEmail, delivery.recipientPhone))
        .filter(Boolean) as string[],
    );
    // Shared within this page. Each callback claims its contact synchronously before its first await,
    // so duplicate donor rows that point to the same destination cannot race into the provider.
    const claimedBatchContacts = new Set<string>();

    for (const skipped of plan.skippedList) {
      if (alreadyDone.has(skipped.userId)) continue;
      await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: skipped.userId, locale: skipped.locale, purpose, origin, createdBy: actor?.actorId ?? null }, skipped.reason);
      tally.skipped += 1;
      bump(tally.reasons, skipped.reason);
    }

    // One batched query for every recipient variable set, rather than per-message: without a real
    // context the renderer falls back to SAMPLE values, which is how campaigns were going out
    // addressed to the sample donor instead of the actual one.
    const contexts = await loadContextsForUserIds(plan.recipients.map((recipient) => recipient.userId)).catch(() => new Map());

    /*
     * Provider calls are I/O-bound. Sending one recipient at a time made a 200-recipient page take
     * roughly the sum of 200 network round trips. Use bounded concurrency instead: enough parallelism
     * to keep Meta/Elastic Email busy, but never an unbounded Promise.all that could burst provider
     * limits or exhaust database connections. Defaults are deliberately conservative and can be
     * tuned per environment with COMMUNICATION_*_CONCURRENCY.
     */
    const outcomes = await mapWithConcurrency(plan.recipients, sendConcurrency(channel, speedMode), async (recipient): Promise<BatchTally> => {
      const outcome: BatchTally = { total: 0, sent: 0, skipped: 0, failed: 0, reasons: {} };
      if (alreadyDone.has(recipient.userId)) {
        bump(outcome.reasons, "ALREADY_PROCESSED");
        return outcome;
      }

      const contactKey = normalizeRecipientContact(channel, recipient.email, recipient.phone);
      if (contactKey && (alreadyDoneContacts.has(contactKey) || claimedBatchContacts.has(contactKey))) {
        await recordSkippedDelivery({
          channel,
          campaignId,
          templateId,
          recipientUserId: recipient.userId,
          recipientEmail: channel === "EMAIL" ? recipient.email : null,
          recipientPhone: channel !== "EMAIL" ? recipient.phone : null,
          locale: recipient.locale,
          purpose,
          origin,
          createdBy: actor?.actorId ?? null,
        }, "DUPLICATE_RECIPIENT_CONTACT");
        outcome.skipped += 1;
        bump(outcome.reasons, "DUPLICATE_RECIPIENT_CONTACT");
        return outcome;
      }
      if (contactKey) claimedBatchContacts.add(contactKey);

      const loadedCtx = contexts.get(recipient.userId) ?? null;
      const recipientCtx = loadedCtx && updateSource
        ? { ...loadedCtx, update: updateContextFor(updateSource, recipient.locale, campaignId) }
        : loadedCtx;
      if (!recipientCtx) {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin }, "CONTEXT_LOAD_FAILED");
        outcome.skipped += 1;
        bump(outcome.reasons, "CONTEXT_LOAD_FAILED");
        return outcome;
      }

      const rendered = await renderChannelTemplate(channel, templateId, recipient.locale, recipientCtx, fallbackLocale);
      if (!rendered) {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin }, "TEMPLATE_RENDER_FAILED");
        outcome.skipped += 1;
        bump(outcome.reasons, "TEMPLATE_RENDER_FAILED");
        return outcome;
      }
      if (rendered.usedFallback && decisions[recipient.locale] === "EXCLUDE") {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin, templateName: rendered.templateName }, "LANGUAGE_EXCLUDED");
        outcome.skipped += 1;
        bump(outcome.reasons, "LANGUAGE_EXCLUDED");
        return outcome;
      }

      const routed = resolveSenderFromSnapshot(senderSnapshot, { locale: recipient.locale, country: recipient.country, purpose });
      const sender = routed.ok ? routed.sender : null;
      const routingReason = routed.ok ? null : routed.reason;
      const to = channel === "EMAIL" ? recipient.email ?? "" : recipient.phone ?? "";
      const decision = resolveProviderForSendWithRuntime(runtime, channel, sender, { country: recipient.country, phone: to });
      const provider = decision.canSend
        ? decision.providerId
        : channel === "WHATSAPP"
          ? "META_WHATSAPP"
          : channel === "EMAIL"
            ? EMAIL_PROVIDER_ID
            : undefined;
      const created = await createDeliveryRecord({
        channel,
        provider: provider as never,
        campaignId,
        templateId,
        templateName: rendered.templateName,
        recipientUserId: recipient.userId,
        recipientEmail: channel === "EMAIL" ? recipient.email : null,
        recipientPhone: channel !== "EMAIL" ? recipient.phone : null,
        recipientName: recipient.name,
        locale: recipient.locale,
        purpose,
        origin,
        renderedSubject: rendered.subject,
        renderedBody: rendered.body,
        senderId: sender?.id ?? null,
        createdBy: actor?.actorId ?? null,
        status: "RENDERED",
      });
      if (!created.ok) {
        outcome.failed += 1;
        bump(outcome.reasons, "ARCHIVE_FAILED");
        return outcome;
      }

      const deliveryId = created.data.id;
      if (!sender && channel !== "SMS") {
        const reason = routingReason ?? "NO_SENDER_AVAILABLE";
        await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: reason });
        outcome.skipped += 1;
        bump(outcome.reasons, reason);
        return outcome;
      }

      let metaName = rendered.templateName;
      let metaLanguage: string = recipient.locale;
      let metaComponents: unknown[] | undefined;
      if (channel === "WHATSAPP") {
        const readiness = whatsapp && sender?.businessAccountId
          ? resolveVariantForLocale(whatsapp.byWaba.get(sender.businessAccountId) ?? [], recipient.locale, fallbackLocale)
          : NOT_READY;
        if (!readiness.ready || !readiness.providerTemplateName || !readiness.languageCode) {
          const reason = readiness.reason ?? "META_TEMPLATE_REQUIRED";
          await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: reason });
          outcome.skipped += 1;
          bump(outcome.reasons, reason);
          return outcome;
        }
        const actualMetaCategory = String(readiness.category ?? "").toUpperCase();
        const expectedMetaCategory =
          purpose === "MARKETING" ? "MARKETING"
          : purpose === "AUTHENTICATION" ? "AUTHENTICATION"
          : purpose === "UTILITY" || purpose === "TRANSACTIONAL" ? "UTILITY"
          : null;
        if (expectedMetaCategory && actualMetaCategory && actualMetaCategory !== expectedMetaCategory) {
          const reason = "META_TEMPLATE_CATEGORY_MISMATCH";
          await markDeliveryStatus(deliveryId, "SKIPPED", {
            errorMessage: `${reason}: Meta=${actualMetaCategory}; expected=${expectedMetaCategory}`,
          });
          outcome.skipped += 1;
          bump(outcome.reasons, reason);
          return outcome;
        }
        const built = buildMetaComponents({
          componentsSchema: readiness.componentsSchema,
          values: templateValuesFor(whatsapp?.positionalNames ?? [], recipientCtx),
          positionalNames: whatsapp?.positionalNames ?? [],
          scopedNames: whatsapp?.scopedNames ?? {},
          headerMediaUrl: whatsapp?.headerMediaUrl ?? null,
          headerMediaFilename: whatsapp?.headerMediaFilename ?? null,
          headerLocation: whatsapp?.headerLocation ?? null,
        });
        if (!built.ok) {
          await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: `${built.reason}  ${built.detail}` });
          outcome.skipped += 1;
          bump(outcome.reasons, built.reason);
          return outcome;
        }
        metaName = readiness.providerTemplateName;
        metaLanguage = readiness.languageCode;
        metaComponents = built.components;
      }

      const result = await sendPreparedDelivery({
        channel,
        sender,
        country: recipient.country,
        to,
        templateName: metaName,
        languageCode: metaLanguage,
        components: metaComponents,
        subject: rendered.subject,
        html: rendered.body,
        purpose,
        locale: recipient.locale,
        channelName: campaignName,
      }, runtime);

      if (!result.ok) {
        const terminal =
          result.reason.endsWith("_NOT_CONFIGURED") ||
          result.reason.endsWith("_NOT_IMPLEMENTED") ||
          result.reason === "EMAIL_SUPPRESSED" ||
          result.reason.includes("SENDER_MISSING") ||
          result.reason === "PROVIDER_DISABLED" ||
          result.reason === "INTEGRATION_DECRYPTION_FAILED" ||
          result.reason === "INTEGRATION_DATABASE_UNAVAILABLE";
        await markDeliveryStatus(deliveryId, terminal ? "SKIPPED" : "FAILED", {
          errorMessage: result.detail ? `${result.reason}  ${result.detail}` : result.reason,
        });
        if (terminal) outcome.skipped += 1;
        else outcome.failed += 1;
        bump(outcome.reasons, result.reason);
        return outcome;
      }

      await markDeliveryStatus(deliveryId, "SENT", {
        providerMessageId: result.providerMessageId,
        internalAccepted: result.internalAccepted,
      });
      outcome.sent += 1;
      bump(outcome.reasons, "SENT");
      return outcome;
    });

    for (const outcome of outcomes) mergeBatchTally(tally, outcome);
    return tally;
  }

  /* ── The walk ──────────────────────────────────────────────────────────
     Batch after batch until the audience is exhausted, this run's batch budget
     is spent, or a batch turns out to be blocked. The cursor and tallies are
     written after every batch, so a request that dies mid-walk loses at most
     the batch it was in  the next run resumes from the last cursor. */
  let plan: SendPlan | null = firstPlan;
  let batches = 0;
  let exhausted = firstPlan.exhausted;
  let cursor = firstPlan.nextCursor;

  while (plan && batches < maxBatches) {
    // Re-check before every page so an operator can hit Pause while a large campaign is mid-walk,
    // and so crossing midnight/quiet-hours or the rolling daily cap stops before the next provider call.
    const liveCampaign = await getCampaign(campaignId);
    if (!liveCampaign) { base.blocked = "NOT_FOUND"; break; }
    const liveGate = await evaluateCampaignSendControls(liveCampaign);
    if (!liveGate.ok) { base.blocked = liveGate.reason; break; }

    const quietSlice = recipientQuietHoursSlice(plan, liveGate.controls);
    if (quietSlice.blocked || !quietSlice.plan) {
      base.blocked = "QUIET_HOURS";
      break;
    }
    plan = quietSlice.plan;

    const remainingRecipients = Math.max(plan.audienceTotal - progress.total, plan.total);
    const liveSpeed = liveGate.controls.autoSpeed
      ? autoSpeedMode({
          remainingRecipients,
          remainingDaily: liveGate.remainingDaily,
          scheduledStopAt: liveGate.controls.scheduledStopAt,
        })
      : liveGate.controls.speedMode;
    const tally = await runBatch(plan, liveSpeed);
    batches += 1;
    exhausted = plan.exhausted;
    cursor = plan.nextCursor;

    base.total += tally.total; base.sent += tally.sent; base.skipped += tally.skipped; base.failed += tally.failed;
    for (const [key, value] of Object.entries(tally.reasons)) base.reasons[key] = (base.reasons[key] ?? 0) + value;
    progress.cursor = cursor;
    progress.batches += 1;
    progress.total += tally.total; progress.sent += tally.sent; progress.skipped += tally.skipped; progress.failed += tally.failed;
    for (const [key, value] of Object.entries(tally.reasons)) progress.reasons[key] = (progress.reasons[key] ?? 0) + value;
    progress.updatedAt = new Date().toISOString();
    progress.done = exhausted;
    /* A batch that ran clears the blocked streak  the count is about consecutive failures to start. */
    progress.blockedRuns = 0;
    /* The lease is renewed with each batch: a long but healthy walk must not look crashed to the
       next scheduler tick while it is still working. */
    lease.expiresAt = new Date(Date.now() + LEASE_MS).toISOString();
    await patchMetadata(campaignId, { sendProgress: { ...progress }, sendLease: exhausted ? null : lease });

    if (exhausted || batches >= maxBatches) break;
    const fresh = await getCampaign(campaignId);
    if (!fresh) { base.blocked = "NOT_FOUND"; break; }
    const nextGate = await evaluateCampaignSendControls(fresh);
    if (!nextGate.ok) { base.blocked = nextGate.reason; break; }
    const remainingForNextBatch = Math.max(firstPlan.audienceTotal - progress.total, 0);
    const nextMode = nextGate.controls.autoSpeed
      ? autoSpeedMode({
          remainingRecipients: remainingForNextBatch,
          remainingDaily: nextGate.remainingDaily,
          scheduledStopAt: nextGate.controls.scheduledStopAt,
        })
      : nextGate.controls.speedMode;
    const nextSpeed = speedSettings(nextMode);
    const desiredNextBatch = Math.min(opts.batchSize ?? nextSpeed.batchSize, 1000);
    const nextBatchSize = Math.max(1, Math.min(desiredNextBatch, nextGate.remainingDaily ?? desiredNextBatch));
    const next = await planCampaignSend(campaignId, { batchSize: nextBatchSize, cursor });
    /* A blocked page mid-walk (a provider that went away, a template that stopped rendering) stops
       the walk here and leaves the campaign resumable rather than declaring it finished. */
    if (next.blocked) {
      if (next.blocked === "AUDIENCE_EXHAUSTED") { exhausted = true; progress.done = true; await patchMetadata(campaignId, { sendProgress: { ...progress }, sendLease: null }); }
      else base.blocked = next.blocked;
      break;
    }
    plan = next;
    base.truncated = next.truncated;
  }

  const hasMore = !exhausted;
  /* The status is only final once the audience is. While recipients remain the campaign stays
     SENDING  which is both the truth and what makes the scheduler pick it up again. */
  const finalStatus = hasMore ? "SENDING" : computeFinalStatus(progress.total, progress.sent, progress.skipped, progress.failed);
  base.truncated = hasMore;
  await mutateCampaignMetadata(
    campaignId,
    (current) => ({
      ...current,
      /* Released on every exit, including one that stops with recipients left: the lease protects a
         run that is *in flight*, and this one has finished. Holding it would stall the next
         scheduler tick (and any deliberate resume) for no reason. A crashed run is the case the
         expiry is for  it leaves the lease behind and it goes stale on its own. */
      sendProgress: { ...progress },
      sendLease: null,
      lastRun: { ranAt: new Date().toISOString(), mode, batches, total: progress.total, sent: progress.sent, skipped: progress.skipped, failed: progress.failed, blocked: base.blocked ?? null, reasons: progress.reasons, truncated: hasMore, hasMore },
    }),
    { status: finalStatus, expectedStatus: "SENDING" },
  );
  // The counters are derived from the delivery rows rather than incremented by this run's tallies.
  // `{ increment }` double-counted a re-run and, more importantly, froze `sentCount` at "the
  // provider accepted it"  the number the event webhook later contradicts. Deriving keeps the
  // header and the delivery log answering the same question, and it is what lets a later
  // Suppress/bounce pull `sentCount` back down instead of leaving the campaign claiming success.
  await recomputeCampaignCounters(campaignId).catch(() => {});
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined, actorName: actor?.actorName ?? undefined, actorRole: actor?.actorRole ?? "ADMIN",
    action: "communication.campaign.send",
    messageAr: hasMore
      ? `تنفيذ دفعة من حملة «${campaign.name}»  أُرسل ${base.sent}، تخطّي ${base.skipped}، فشل ${base.failed} (المتابعة مجدولة)`
      : `اكتمل إرسال حملة «${campaign.name}»  أُرسل ${progress.sent}، تخطّي ${progress.skipped}، فشل ${progress.failed}`,
    messageEn: hasMore
      ? `Campaign batch executed: ${campaign.name}  sent ${base.sent}, skipped ${base.skipped}, failed ${base.failed} (will continue)`
      : `Campaign send completed: ${campaign.name}  sent ${progress.sent}, skipped ${progress.skipped}, failed ${progress.failed}`,
    entityType: "CommunicationCampaign", entityId: campaignId,
    metadata: { mode, batches, sent: base.sent, skipped: base.skipped, failed: base.failed, cumulative: { sent: progress.sent, skipped: progress.skipped, failed: progress.failed }, hasMore, truncated: hasMore, externalCall: base.sent > 0 },
    stream: "TEAM",
  });
  base.ok = true; base.status = finalStatus; base.batches = batches; base.hasMore = hasMore;
  return base;
}

/**
 * The scheduler's tick: campaigns whose schedule has come due, and campaigns already mid-walk whose
 * last run stopped before the audience ran out. The second half is what turns a batched send into a
 * complete one  without it a 3,000-recipient campaign would sit in SENDING with 200 contacted.
 *
 * A campaign whose lease is still fresh is left alone; it is being worked on right now.
 */
export async function runDueCampaigns(opts: { actor?: Actor; max?: number } = {}): Promise<ExecutionSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const max = Math.min(opts.max ?? 10, 50);
  const results: ExecutionSummary[] = [];

  const dueCandidates = await prisma.communicationCampaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true, metadata: true, scheduledAt: true },
    take: Math.min(max * 5, 250),
  }).catch(() => []);
  dueCandidates.sort((a, b) => {
    const pa = campaignPriorityRank(campaignSendControls(a as Pick<CommunicationCampaign, "metadata">).priority);
    const pb = campaignPriorityRank(campaignSendControls(b as Pick<CommunicationCampaign, "metadata">).priority);
    if (pa !== pb) return pa - pb;
    return (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0);
  });
  const due = dueCandidates.slice(0, max);
  for (const campaign of due) results.push(await executeCampaignSend(campaign.id, { actor: opts.actor, mode: "DUE" }));

  const budget = max - due.length;
  if (budget > 0) {
    const inFlight = await prisma.communicationCampaign.findMany({
      where: { status: "SENDING" },
      select: { id: true, metadata: true, updatedAt: true },
      take: Math.min(budget * 8, 250),
    }).catch(() => []);
    inFlight.sort((a, b) => {
      const pa = campaignPriorityRank(campaignSendControls(a as Pick<CommunicationCampaign, "metadata">).priority);
      const pb = campaignPriorityRank(campaignSendControls(b as Pick<CommunicationCampaign, "metadata">).priority);
      if (pa !== pb) return pa - pb;
      return a.updatedAt.getTime() - b.updatedAt.getTime();
    });
    for (const row of inFlight) {
      if (results.length >= max) break;
      const asCampaign = row as unknown as CommunicationCampaign;
      const progress = progressOf(asCampaign);
      if (!progress || progress.done) continue;
      if (leaseIsFresh(leaseOf(asCampaign))) continue;
      results.push(await executeCampaignSend(row.id, { actor: opts.actor, mode: "RESUME" }));
    }
  }
  return results;
}
