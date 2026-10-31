import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { getCampaign } from "./campaign-service";
import { evaluateCoverageGate } from "./campaign-approval-service";
import { evaluateCampaignSendControls } from "./campaign-send-controls";
import { planCampaignSend } from "./campaign-send-planner";
import { isResumableBlockedCampaign } from "./communication-runtime-types";

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };

/** Readiness only. No provider call, recipient contact or credential reaches the UI. */
async function recoveryState(id: string) {
  const campaign = await getCampaign(id);
  if (!campaign) return null;
  const metadata = object(campaign.metadata), progress = object(metadata.sendProgress), lastRun = object(metadata.lastRun), lease = object(metadata.sendLease);
  const [coverage, controls] = await Promise.all([evaluateCoverageGate(id), evaluateCampaignSendControls(campaign)]);
  let blocked: string | null = !coverage.ok ? "LANGUAGE_COVERAGE_INCOMPLETE" : !isResumableBlockedCampaign(campaign) ? "NOT_RESUMABLE" : null;
  if (!blocked && typeof lease.expiresAt === "string" && Date.parse(lease.expiresAt) > Date.now()) blocked = "ALREADY_RUNNING";
  if (!blocked && !controls.ok) blocked = controls.reason;
  if (!blocked) {
    const plan = await planCampaignSend(id, { batchSize: 1, cursor: typeof progress.cursor === "string" ? progress.cursor : null });
    if (plan.blocked && plan.blocked !== "AUDIENCE_EXHAUSTED") blocked = plan.blocked;
  }
  return { campaign, metadata, progress, data: {
    status: campaign.status, lastBlocked: typeof lastRun.blocked === "string" ? lastRun.blocked : null,
    blocked, canResume: blocked === null, coverage,
    controls: { dailyCap: controls.controls.dailyCap, paused: controls.controls.paused },
    progress: { batches: Number(progress.batches) || 0, scanned: Number(progress.total) || 0, done: progress.done === true },
  } };
}
export async function inspectCampaignRecovery(id: string) {
  const state = await recoveryState(id);
  return state ? { ok: true as const, data: state.data } : { ok: false as const, status: 404, error: "NOT_FOUND" };
}

/** Explicitly queue the saved walk; no provider is called and no cursor is reset. */
export async function queueCampaignRecovery(id: string, actor: Actor) {
  const state = await recoveryState(id);
  if (!state) return { ok: false as const, status: 404, error: "NOT_FOUND" };
  if (!state.data.canResume) return { ok: false as const, status: 409, error: state.data.blocked!, diagnostic: state.data };
  const { campaign, metadata, progress } = state;
  const ranAt = new Date().toISOString();
  const changed = await prisma.communicationCampaign.updateMany({
    where: { id, status: "BLOCKED", updatedAt: campaign.updatedAt },
    data: { status: "SENDING", metadata: { ...metadata, sendProgress: { ...progress, done: false, blockedRuns: 0, updatedAt: ranAt }, sendLease: null, lastRun: { mode: "RECOVERY_QUEUED", ranAt, previousBlocked: state.data.lastBlocked } } as never },
  });
  if (changed.count !== 1) return { ok: false as const, status: 409, error: "CAMPAIGN_STATE_CHANGED" };
  await writeAuditLog({ actorId: actor.actorId ?? undefined, actorName: actor.actorName ?? undefined, actorRole: actor.actorRole ?? "ADMIN", action: "communication.campaign.recovery.queued", entityType: "CommunicationCampaign", entityId: id, messageAr: `جدولة استكمال حملة «${campaign.name}» من موضعها المحفوظ`, metadata: { providerCalls: 0, previousBlocked: state.data.lastBlocked, cursorReset: false }, stream: "TEAM" });
  return { ok: true as const, data: { status: "SENDING", queued: true, providerCalls: 0 } };
}
