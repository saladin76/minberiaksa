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
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot } from "./sender-resolution";
import { resolveVariantForLocale, NOT_READY, META_PROVIDER } from "./whatsapp-template-sync";
import { buildMetaComponents } from "./providers/meta-whatsapp/parameters";
import { resolveAudienceOrigin } from "./audience-list-service";
import { computeFinalStatus, recomputeCampaignCounters } from "./campaign-counter-service";
import { type CommunicationChannelId, type CommunicationPurposeId } from "./communication-runtime-types";

export { computeFinalStatus };

/** Meta's answer for one template: every language variant, and the local placeholder order. */
async function loadWhatsappTemplateTruth(templateId: string): Promise<{
  variants: Parameters<typeof resolveVariantForLocale>[0];
  positionalNames: string[];
}> {
  const [variants, tpl] = await Promise.all([
    prisma.whatsappTemplateVariant
      .findMany({
        where: { templateId, provider: META_PROVIDER },
        select: { languageCode: true, locale: true, approvalStatus: true, providerTemplateName: true, componentsSchema: true, rejectionReason: true, lastSyncedAt: true },
      })
      .catch(() => []),
    prisma.whatsappTemplate.findUnique({ where: { id: templateId }, select: { variables: true } }).catch(() => null),
  ]);
  const catalog = Array.isArray(tpl?.variables) ? (tpl!.variables as unknown[]) : [];
  const positionalNames = catalog
    .map((entry) => (entry && typeof entry === "object" ? String((entry as { key?: unknown }).key ?? "") : ""))
    .filter((key) => key.length > 0);
  return { variants: variants as Parameters<typeof resolveVariantForLocale>[0], positionalNames };
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
 * reported itself SENT after 200 — the remaining 2,800 were never contacted and nothing in the
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
 * campaign+template — that is the backstop behind both of the above, and the reason a re-run is safe
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
  /** True when the audience still has recipients left — the scheduler will continue. */
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
 * waited out — that is the point of resuming — but a permanently broken campaign must stop asking
 * the scheduler every ten minutes and must stop looking "in progress" to whoever is watching.
 */
const MAX_BLOCKED_RESUMES = 3;

type Lease = { token: string; expiresAt: string; holder?: string | null };

function bump(reasons: Record<string, number>, key: string) { reasons[key] = (reasons[key] ?? 0) + 1; }
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

/** Merge into the campaign's metadata without dropping the keys this module does not own. */
async function patchMetadata(campaignId: string, current: Record<string, unknown>, patch: Record<string, unknown>) {
  await prisma.communicationCampaign
    .update({ where: { id: campaignId }, data: { metadata: { ...current, ...patch } as never } })
    .catch(() => {});
}

async function auditBlocked(campaign: CommunicationCampaign, reason: string, actor: Actor, mode: SendMode, plan?: SendPlan) {
  await writeAuditLog({ actorId: actor?.actorId ?? undefined, actorName: actor?.actorName ?? undefined, actorRole: actor?.actorRole ?? "ADMIN", action: "communication.campaign.send.blocked", messageAr: `تعذّر إرسال حملة «${campaign.name}» — السبب: ${reason}`, messageEn: `Campaign send blocked: ${campaign.name} — ${reason}`, entityType: "CommunicationCampaign", entityId: campaign.id, metadata: { mode, reason, summary: plan ? { total: plan.total, eligible: plan.eligible, skipped: plan.skipped, reasons: plan.reasons } : undefined, externalCall: false, autoSend: false }, stream: "TEAM" });
}

/** Tallies for one batch, added into the run's and the campaign's running totals. */
type BatchTally = { total: number; sent: number; skipped: number; failed: number; reasons: Record<string, number> };

export async function executeCampaignSend(
  campaignId: string,
  opts: { actor?: Actor; mode?: SendMode; batchSize?: number; maxBatches?: number } = {},
): Promise<ExecutionSummary> {
  const mode = opts.mode ?? "SEND_NOW";
  const batchSize = Math.min(opts.batchSize ?? 200, 1000);
  const maxBatches = Math.max(1, Math.min(opts.maxBatches ?? DEFAULT_MAX_BATCHES, 50));
  const actor = opts.actor ?? null;
  const base: ExecutionSummary = { ok: false, campaignId, status: "", total: 0, sent: 0, skipped: 0, failed: 0, truncated: false, reasons: {}, batches: 0 };
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ...base, blocked: "NOT_FOUND" };
  base.status = campaign.status;

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
    /* A mid-walk campaign that cannot run is left resumable so a provider outage can be waited out —
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
      await prisma.communicationCampaign.update({
        where: { id: campaignId },
        data: { status: computeFinalStatus(progress.total, progress.sent, progress.skipped, progress.failed), metadata: { ...metaOf(campaign), sendProgress: { ...progress }, sendLease: null, lastRun } as never },
      }).catch(() => {});
    } else {
      await patchMetadata(campaignId, metaOf(campaign), { lastRun, sendLease: null, ...(resuming ? { sendProgress: { ...progress } } : {}) });
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
  }
  await patchMetadata(campaignId, metaOf(campaign), { sendLease: lease, sendProgress: { ...progress, updatedAt: new Date().toISOString() } });

  /* ── Everything the batches share, resolved once ───────────────────── */
  const runtime = await getActiveCommunicationRuntimeBundle();
  const channel = campaign.channel as CommunicationChannelId;
  const templateId = campaign.templateGroupId as string;
  const decisions = coverageDecisions(campaign);
  const purpose = campaign.purpose as CommunicationPurposeId;
  const origin = await resolveAudienceOrigin(campaign.audienceSegmentKey);
  const senderSnapshot = await loadSenderRoutingSnapshot(channel, runtime);
  /* WhatsApp template truth, read once for the whole run: which languages Meta approved, and what
     parameters each of those variants takes. Reading it per recipient would be thousands of queries
     for one answer that cannot change mid-batch. */
  const whatsapp = channel === "WHATSAPP" ? await loadWhatsappTemplateTruth(templateId) : null;

  /** One batch: archive its skips, render, route and send each eligible recipient. */
  async function runBatch(plan: SendPlan): Promise<BatchTally> {
    const tally: BatchTally = { total: plan.total, sent: 0, skipped: 0, failed: 0, reasons: {} };
    /* Read per batch rather than once per run: a batch can take minutes, and this is the guard that
       makes a re-run (or an overlapping one) stop short of sending twice. */
    const existing = await prisma.communicationDelivery.findMany({ where: { campaignId, templateId, channel, origin }, select: { recipientUserId: true, status: true, providerMessageId: true } }).catch(() => []);
    const alreadyDone = new Set(existing.filter((delivery) => (delivery.status && PROCESSED_STATUSES.includes(delivery.status)) || !!delivery.providerMessageId).map((delivery) => delivery.recipientUserId).filter(Boolean) as string[]);

    for (const skipped of plan.skippedList) {
      if (alreadyDone.has(skipped.userId)) continue;
      await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: skipped.userId, locale: skipped.locale, purpose, origin, createdBy: actor?.actorId ?? null }, skipped.reason);
      tally.skipped += 1; bump(tally.reasons, skipped.reason);
    }

    // One batched query for every recipient variable set, rather than per-message: without a real
    // context the renderer falls back to SAMPLE values, which is how campaigns were going out
    // addressed to the sample donor instead of the actual one.
    const contexts = await loadContextsForUserIds(plan.recipients.map((r) => r.userId)).catch(() => new Map());

    for (const recipient of plan.recipients) {
      if (alreadyDone.has(recipient.userId)) { bump(tally.reasons, "ALREADY_PROCESSED"); continue; }
      const recipientCtx = contexts.get(recipient.userId) ?? null;
      if (!recipientCtx) {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin }, "CONTEXT_LOAD_FAILED");
        tally.skipped += 1; bump(tally.reasons, "CONTEXT_LOAD_FAILED"); continue;
      }
      const rendered = await renderChannelTemplate(channel, templateId, recipient.locale, recipientCtx);
      if (!rendered) {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin }, "TEMPLATE_RENDER_FAILED");
        tally.skipped += 1; bump(tally.reasons, "TEMPLATE_RENDER_FAILED"); continue;
      }
      if (rendered.usedFallback && decisions[recipient.locale] === "EXCLUDE") {
        await recordSkippedDelivery({ channel, campaignId, templateId, recipientUserId: recipient.userId, locale: recipient.locale, purpose, origin, templateName: rendered.templateName }, "LANGUAGE_EXCLUDED");
        tally.skipped += 1; bump(tally.reasons, "LANGUAGE_EXCLUDED"); continue;
      }

      /* One resolver, the same one triggers, retries and gift messages use, routed on this
         recipient's own locale and country. A refusal is final: the environment default number no
         longer overrides a rule that deliberately declined to serve this recipient. */
      const routed = resolveSenderFromSnapshot(senderSnapshot, { locale: recipient.locale, country: recipient.country, purpose });
      const sender = routed.ok ? routed.sender : null;
      const routingReason = routed.ok ? null : routed.reason;
      const to = channel === "EMAIL" ? recipient.email ?? "" : recipient.phone ?? "";
      const decision = resolveProviderForSendWithRuntime(runtime, channel, sender, { country: recipient.country, phone: to });
      const provider = decision.canSend ? decision.providerId : channel === "WHATSAPP" ? "META_WHATSAPP" : channel === "EMAIL" ? EMAIL_PROVIDER_ID : undefined;
      const created = await createDeliveryRecord({ channel, provider: provider as never, campaignId, templateId, templateName: rendered.templateName, recipientUserId: recipient.userId, recipientEmail: channel === "EMAIL" ? recipient.email : null, recipientPhone: channel !== "EMAIL" ? recipient.phone : null, recipientName: recipient.name, locale: recipient.locale, purpose, origin, renderedSubject: rendered.subject, renderedBody: rendered.body, senderId: sender?.id ?? null, createdBy: actor?.actorId ?? null, status: "RENDERED" });
      if (!created.ok) { tally.failed += 1; bump(tally.reasons, "ARCHIVE_FAILED"); continue; }
      const deliveryId = created.data.id;
      if (!sender && channel !== "SMS") {
        const reason = routingReason ?? "NO_SENDER_AVAILABLE";
        await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: reason });
        tally.skipped += 1; bump(tally.reasons, reason); continue;
      }

      /* WhatsApp: the name and language come from the variant Meta actually approved for this
         locale, and the parameters from the schema that variant declares. Sending the recipient's
         own locale as the language, as this did, is rejected outright whenever that language was
         never approved — the message was lost although a good Arabic variant existed. */
      let metaName = rendered.templateName;
      let metaLanguage: string = recipient.locale;
      let metaComponents: unknown[] | undefined;
      if (channel === "WHATSAPP") {
        const readiness = whatsapp ? resolveVariantForLocale(whatsapp.variants, recipient.locale) : NOT_READY;
        if (!readiness.ready || !readiness.providerTemplateName || !readiness.languageCode) {
          const reason = readiness.reason ?? "META_TEMPLATE_REQUIRED";
          await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: reason });
          tally.skipped += 1; bump(tally.reasons, reason); continue;
        }
        const built = buildMetaComponents({
          componentsSchema: readiness.componentsSchema,
          values: templateValuesFor(whatsapp?.positionalNames ?? [], recipientCtx),
          positionalNames: whatsapp?.positionalNames ?? [],
        });
        if (!built.ok) {
          await markDeliveryStatus(deliveryId, "SKIPPED", { errorMessage: `${built.reason} — ${built.detail}` });
          tally.skipped += 1; bump(tally.reasons, built.reason); continue;
        }
        metaName = readiness.providerTemplateName;
        metaLanguage = readiness.languageCode;
        metaComponents = built.components;
      }

      const result = await sendPreparedDelivery({ channel, sender, country: recipient.country, to, templateName: metaName, languageCode: metaLanguage, components: metaComponents, subject: rendered.subject, html: rendered.body }, runtime);
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
        if (terminal) tally.skipped += 1; else tally.failed += 1;
        bump(tally.reasons, result.reason); continue;
      }
      await markDeliveryStatus(deliveryId, "SENT", { providerMessageId: result.providerMessageId, internalAccepted: result.internalAccepted });
      tally.sent += 1; bump(tally.reasons, "SENT");
    }
    return tally;
  }

  /* ── The walk ──────────────────────────────────────────────────────────
     Batch after batch until the audience is exhausted, this run's batch budget
     is spent, or a batch turns out to be blocked. The cursor and tallies are
     written after every batch, so a request that dies mid-walk loses at most
     the batch it was in — the next run resumes from the last cursor. */
  let plan: SendPlan | null = firstPlan;
  let batches = 0;
  let exhausted = firstPlan.exhausted;
  let cursor = firstPlan.nextCursor;

  while (plan && batches < maxBatches) {
    const tally = await runBatch(plan);
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
    /* A batch that ran clears the blocked streak — the count is about consecutive failures to start. */
    progress.blockedRuns = 0;
    /* The lease is renewed with each batch: a long but healthy walk must not look crashed to the
       next scheduler tick while it is still working. */
    lease.expiresAt = new Date(Date.now() + LEASE_MS).toISOString();
    await patchMetadata(campaignId, metaOf(campaign), { sendProgress: { ...progress }, sendLease: exhausted ? null : lease });

    if (exhausted || batches >= maxBatches) break;
    const next = await planCampaignSend(campaignId, { batchSize, cursor });
    /* A blocked page mid-walk (a provider that went away, a template that stopped rendering) stops
       the walk here and leaves the campaign resumable rather than declaring it finished. */
    if (next.blocked) {
      if (next.blocked === "AUDIENCE_EXHAUSTED") { exhausted = true; progress.done = true; await patchMetadata(campaignId, metaOf(campaign), { sendProgress: { ...progress }, sendLease: null }); }
      else base.blocked = next.blocked;
      break;
    }
    plan = next;
    base.truncated = next.truncated;
  }

  const hasMore = !exhausted;
  /* The status is only final once the audience is. While recipients remain the campaign stays
     SENDING — which is both the truth and what makes the scheduler pick it up again. */
  const finalStatus = hasMore ? "SENDING" : computeFinalStatus(progress.total, progress.sent, progress.skipped, progress.failed);
  base.truncated = hasMore;
  await prisma.communicationCampaign.update({
    where: { id: campaignId },
    data: {
      status: finalStatus,
      metadata: {
        ...metaOf(campaign),
        /* Released on every exit, including one that stops with recipients left: the lease protects a
           run that is *in flight*, and this one has finished. Holding it would stall the next
           scheduler tick (and any deliberate resume) for no reason. A crashed run is the case the
           expiry is for — it leaves the lease behind and it goes stale on its own. */
        sendProgress: { ...progress },
        sendLease: null,
        lastRun: { ranAt: new Date().toISOString(), mode, batches, total: progress.total, sent: progress.sent, skipped: progress.skipped, failed: progress.failed, blocked: base.blocked ?? null, reasons: progress.reasons, truncated: hasMore, hasMore },
      } as never,
    },
  }).catch(() => {});
  // The counters are derived from the delivery rows rather than incremented by this run's tallies.
  // `{ increment }` double-counted a re-run and, more importantly, froze `sentCount` at "the
  // provider accepted it" — the number the event webhook later contradicts. Deriving keeps the
  // header and the delivery log answering the same question, and it is what lets a later
  // Suppress/bounce pull `sentCount` back down instead of leaving the campaign claiming success.
  await recomputeCampaignCounters(campaignId).catch(() => {});
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined, actorName: actor?.actorName ?? undefined, actorRole: actor?.actorRole ?? "ADMIN",
    action: "communication.campaign.send",
    messageAr: hasMore
      ? `تنفيذ دفعة من حملة «${campaign.name}» — أُرسل ${base.sent}، تخطّي ${base.skipped}، فشل ${base.failed} (المتابعة مجدولة)`
      : `اكتمل إرسال حملة «${campaign.name}» — أُرسل ${progress.sent}، تخطّي ${progress.skipped}، فشل ${progress.failed}`,
    messageEn: hasMore
      ? `Campaign batch executed: ${campaign.name} — sent ${base.sent}, skipped ${base.skipped}, failed ${base.failed} (will continue)`
      : `Campaign send completed: ${campaign.name} — sent ${progress.sent}, skipped ${progress.skipped}, failed ${progress.failed}`,
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
 * complete one — without it a 3,000-recipient campaign would sit in SENDING with 200 contacted.
 *
 * A campaign whose lease is still fresh is left alone; it is being worked on right now.
 */
export async function runDueCampaigns(opts: { actor?: Actor; max?: number } = {}): Promise<ExecutionSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const max = Math.min(opts.max ?? 10, 50);
  const results: ExecutionSummary[] = [];

  const due = await prisma.communicationCampaign.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } }, select: { id: true }, take: max }).catch(() => []);
  for (const campaign of due) results.push(await executeCampaignSend(campaign.id, { actor: opts.actor, mode: "DUE" }));

  const budget = max - due.length;
  if (budget > 0) {
    const inFlight = await prisma.communicationCampaign.findMany({ where: { status: "SENDING" }, select: { id: true, metadata: true }, take: budget * 4 }).catch(() => []);
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
