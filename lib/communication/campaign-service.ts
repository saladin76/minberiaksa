import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { CommunicationCampaign, Prisma } from "@prisma/client";
import { isCommunicationChannel, type CommunicationChannelId, type CampaignStatusId } from "./communication-runtime-types";
import { safeCountValue } from "@/lib/dashboard/safe-count";

/**
 * CampaignService — CRUD + status transitions for CommunicationCampaign. This package
 * covers the workflow up to (but not including) sending: DRAFT → REVIEW → APPROVED →
 * SCHEDULED, plus CANCELLED. Campaigns never send automatically and never move to
 * SENDING/SENT here — that is a later package behind explicit human approval + a provider.
 */

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

export type CampaignInput = {
  name: string;
  channel: CommunicationChannelId;
  purpose?: string;
  audienceSegmentKey?: string | null;
  templateGroupId?: string | null;
  senderRoutingMode?: string;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function dbUnavailable() {
  return { ok: false as const, status: 503, error: "DATABASE_URL is not configured." };
}

export async function listCampaigns(opts: { includeArchived?: boolean } = {}): Promise<CommunicationCampaign[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await prisma.communicationCampaign.findMany({
      where: opts.includeArchived ? undefined : { status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
  } catch (error) {
    console.error("listCampaigns failed", error);
    return [];
  }
}

export async function getCampaign(id: string): Promise<CommunicationCampaign | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await prisma.communicationCampaign.findUnique({ where: { id } });
  } catch (error) {
    console.error("getCampaign failed", error);
    return null;
  }
}

export async function createCampaign(input: CampaignInput, actor?: Actor): Promise<ServiceResult<CommunicationCampaign>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  if (!isCommunicationChannel(input.channel)) return { ok: false, status: 400, error: "Invalid channel." };
  if (!input.name?.trim()) return { ok: false, status: 400, error: "Name is required." };
  try {
    const row = await prisma.communicationCampaign.create({
      data: {
        name: input.name.trim(),
        channel: input.channel,
        purpose: input.purpose ?? "MARKETING",
        audienceSegmentKey: input.audienceSegmentKey ?? null,
        templateGroupId: input.templateGroupId ?? null,
        senderRoutingMode: input.senderRoutingMode ?? "AUTO",
        status: "DRAFT",
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.campaign.create",
      messageAr: `تم إنشاء حملة تواصل: ${row.name}`,
      messageEn: `Communication campaign created: ${row.name}`,
      entityType: "CommunicationCampaign",
      entityId: row.id,
      metadata: { channel: row.channel, status: row.status, externalCall: false, autoSend: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("createCampaign failed", error);
    return { ok: false, status: 500, error: "Failed to create campaign." };
  }
}

export type CampaignUpdate = {
  name?: string;
  purpose?: string;
  audienceSegmentKey?: string | null;
  templateGroupId?: string | null;
  senderRoutingMode?: string;
  metadata?: Record<string, unknown>;
};

/** Edit a campaign's configuration. Only allowed while it is still editable (DRAFT/REVIEW). */
export async function updateCampaign(id: string, patch: CampaignUpdate, actor?: Actor): Promise<ServiceResult<CommunicationCampaign>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const current = await prisma.communicationCampaign.findUnique({ where: { id }, select: { status: true, metadata: true } });
    if (!current) return { ok: false, status: 404, error: "Campaign not found." };

    // Core fields (audience / template / language decisions) that change what would be sent.
    const isCoreEdit =
      patch.audienceSegmentKey !== undefined ||
      patch.templateGroupId !== undefined ||
      (patch.metadata !== undefined && Object.prototype.hasOwnProperty.call(patch.metadata, "coverageDecisions"));

    // Editability by status. SENT/SENDING/terminal/archived are never edited here.
    if (["DRAFT", "REVIEW"].includes(current.status)) {
      // fully editable
    } else if (current.status === "APPROVED") {
      // Editing an approved campaign is allowed but a core change resets it to REVIEW for re-approval.
    } else if (current.status === "SCHEDULED") {
      // Core edits require returning to draft/review first (schedule time is edited via reschedule).
      if (isCoreEdit || patch.name !== undefined || patch.purpose !== undefined) {
        return { ok: false, status: 409, error: "أرجِع الحملة إلى المراجعة قبل تعديل جمهورها أو قالبها." };
      }
    } else {
      return { ok: false, status: 409, error: "لا يمكن تعديل هذه الحملة في حالتها الحالية." };
    }

    // An approved campaign whose core changed drops back to REVIEW (approval cleared).
    const downgradeToReview = current.status === "APPROVED" && isCoreEdit;

    const mergedMetadata =
      patch.metadata !== undefined
        ? ({ ...(current.metadata as Record<string, unknown> | null), ...patch.metadata } as Prisma.InputJsonValue)
        : undefined;
    const row = await prisma.communicationCampaign.update({
      where: { id },
      data: {
        name: patch.name?.trim(),
        purpose: patch.purpose,
        audienceSegmentKey: patch.audienceSegmentKey === undefined ? undefined : patch.audienceSegmentKey ?? null,
        templateGroupId: patch.templateGroupId === undefined ? undefined : patch.templateGroupId ?? null,
        senderRoutingMode: patch.senderRoutingMode,
        metadata: mergedMetadata,
        status: downgradeToReview ? "REVIEW" : undefined,
        approvedBy: downgradeToReview ? null : undefined,
        approvedAt: downgradeToReview ? null : undefined,
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.campaign.update",
      messageAr: `تم تحديث إعداد حملة التواصل: ${row.name}`,
      messageEn: `Communication campaign updated: ${row.name}`,
      entityType: "CommunicationCampaign",
      entityId: row.id,
      metadata: { externalCall: false, autoSend: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("updateCampaign failed", error);
    return { ok: false, status: 500, error: "Failed to update campaign." };
  }
}

export type CampaignAction = "SUBMIT_REVIEW" | "APPROVE" | "SCHEDULE" | "CANCEL";

// Allowed status transitions for the non-sending workflow this package covers.
const TRANSITIONS: Record<CampaignAction, { from: CampaignStatusId[]; to: CampaignStatusId }> = {
  SUBMIT_REVIEW: { from: ["DRAFT"], to: "REVIEW" },
  APPROVE: { from: ["REVIEW"], to: "APPROVED" },
  // SCHEDULED is allowed so a scheduled campaign can have its send time edited (reschedule).
  SCHEDULE: { from: ["APPROVED", "SCHEDULED"], to: "SCHEDULED" },
  CANCEL: { from: ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED"], to: "CANCELLED" },
};

export async function transitionCampaign(
  id: string,
  action: CampaignAction,
  opts?: { scheduledAt?: Date | null; actor?: Actor }
): Promise<ServiceResult<CommunicationCampaign>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  const rule = TRANSITIONS[action];
  if (!rule) return { ok: false, status: 400, error: "Unknown action." };
  try {
    const current = await prisma.communicationCampaign.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!current) return { ok: false, status: 404, error: "Campaign not found." };
    if (!rule.from.includes(current.status as CampaignStatusId)) {
      return { ok: false, status: 409, error: `Cannot ${action} from ${current.status}.` };
    }
    const actor = opts?.actor;
    const row = await prisma.communicationCampaign.update({
      where: { id },
      data: {
        status: rule.to,
        scheduledAt: action === "SCHEDULE" ? opts?.scheduledAt ?? null : undefined,
        approvedBy: action === "APPROVE" ? actor?.actorId ?? undefined : undefined,
        approvedAt: action === "APPROVE" ? new Date() : undefined,
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: `communication.campaign.${action.toLowerCase()}`,
      messageAr: `تم تحديث حالة حملة التواصل «${current.name}» إلى ${rule.to}`,
      messageEn: `Communication campaign "${current.name}" moved to ${rule.to}`,
      entityType: "CommunicationCampaign",
      entityId: row.id,
      metadata: { from: current.status, to: rule.to, externalCall: false, autoSend: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("transitionCampaign failed", error);
    return { ok: false, status: 500, error: "Failed to update campaign status." };
  }
}

// ─────────────────────────── Lifecycle management (Package 5) ───────────────────────────

async function auditCampaign(actor: Actor, action: string, ar: string, en: string, id: string, metadata: Record<string, unknown>) {
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined,
    actorName: actor?.actorName ?? undefined,
    actorRole: actor?.actorRole ?? "ADMIN",
    action,
    messageAr: ar,
    messageEn: en,
    entityType: "CommunicationCampaign",
    entityId: id,
    metadata: { ...metadata, externalCall: false, autoSend: false },
    stream: "TEAM",
  });
}

/**
 * Duplicate a campaign into a fresh DRAFT. Copies channel, purpose, audience, template, sender mode,
 * and the language (coverage) decisions ONLY. Never copies schedule, status, approval, counters,
 * results (`lastRun`), delivery logs, or provider message ids.
 */
export async function duplicateCampaign(id: string, opts: { name?: string | null; actor?: Actor } = {}): Promise<ServiceResult<CommunicationCampaign>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const src = await prisma.communicationCampaign.findUnique({ where: { id } });
    if (!src) return { ok: false, status: 404, error: "Campaign not found." };
    const name = opts.name?.trim() || `${src.name} (نسخة)`;
    const coverageDecisions = (src.metadata as Record<string, unknown> | null)?.coverageDecisions;
    const row = await prisma.communicationCampaign.create({
      data: {
        name,
        channel: src.channel,
        purpose: src.purpose,
        audienceSegmentKey: src.audienceSegmentKey ?? null,
        templateGroupId: src.templateGroupId ?? null,
        senderRoutingMode: src.senderRoutingMode,
        status: "DRAFT",
        scheduledAt: null,
        metadata: (coverageDecisions ? { coverageDecisions } : undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await auditCampaign(opts.actor ?? null, "communication.campaign.duplicate", `نسخ حملة: ${src.name}`, `Duplicated campaign: ${src.name}`, row.id, { sourceId: id });
    return { ok: true, data: row };
  } catch (error) {
    console.error("duplicateCampaign failed", error);
    return { ok: false, status: 500, error: "Failed to duplicate campaign." };
  }
}

/**
 * Delete a DRAFT campaign. Only DRAFT can be hard-deleted, and only when it has NO deliveries. If any
 * delivery exists (logs must be preserved) the campaign is archived instead. Returns which happened.
 */
export async function deleteDraftCampaign(id: string, actor?: Actor): Promise<ServiceResult<{ deleted: boolean; archived: boolean }>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const current = await prisma.communicationCampaign.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!current) return { ok: false, status: 404, error: "Campaign not found." };
    if (current.status !== "DRAFT") return { ok: false, status: 409, error: "لا يمكن حذف إلا المسودات." };

    const deliveries = await safeCountValue("campaign.deliveries", () => prisma.communicationDelivery.count({ where: { campaignId: id } }));
    if (deliveries > 0) {
      await prisma.communicationCampaign.update({ where: { id }, data: { status: "ARCHIVED" } });
      await auditCampaign(actor ?? null, "communication.campaign.archive", `أرشفة مسودة لها سجلات: ${current.name}`, `Archived draft with deliveries: ${current.name}`, id, { reason: "HAS_DELIVERIES", deliveries });
      return { ok: true, data: { deleted: false, archived: true } };
    }

    await prisma.communicationCampaign.delete({ where: { id } });
    await auditCampaign(actor ?? null, "communication.campaign.delete", `حذف مسودة حملة: ${current.name}`, `Deleted draft campaign: ${current.name}`, id, { hardDeleted: true });
    return { ok: true, data: { deleted: true, archived: false } };
  } catch (error) {
    console.error("deleteDraftCampaign failed", error);
    return { ok: false, status: 500, error: "Failed to delete campaign." };
  }
}

const ARCHIVABLE = ["SENT", "SENT_WITH_ISSUES", "FAILED", "BLOCKED", "CANCELLED"];

/** Archive a finished campaign (SENT/…/CANCELLED). Never touches delivery logs. */
export async function archiveCampaign(id: string, actor?: Actor): Promise<ServiceResult<CommunicationCampaign>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const current = await prisma.communicationCampaign.findUnique({ where: { id }, select: { status: true, name: true, metadata: true } });
    if (!current) return { ok: false, status: 404, error: "Campaign not found." };
    if (!ARCHIVABLE.includes(current.status)) return { ok: false, status: 409, error: "يمكن أرشفة الحملات المنتهية فقط." };
    const metadata = { ...(current.metadata as Record<string, unknown> | null), archivedFrom: current.status } as Prisma.InputJsonValue;
    const row = await prisma.communicationCampaign.update({ where: { id }, data: { status: "ARCHIVED", metadata } });
    await auditCampaign(actor ?? null, "communication.campaign.archive", `أرشفة حملة: ${current.name}`, `Archived campaign: ${current.name}`, id, { from: current.status });
    return { ok: true, data: row };
  } catch (error) {
    console.error("archiveCampaign failed", error);
    return { ok: false, status: 500, error: "Failed to archive campaign." };
  }
}

/** Cancel a SCHEDULED campaign's schedule — returns it to APPROVED and clears the time. */
export async function cancelSchedule(id: string, actor?: Actor): Promise<ServiceResult<CommunicationCampaign>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const current = await prisma.communicationCampaign.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!current) return { ok: false, status: 404, error: "Campaign not found." };
    if (current.status !== "SCHEDULED") return { ok: false, status: 409, error: "لا يمكن إلغاء الجدولة إلا لحملة مجدولة." };
    const row = await prisma.communicationCampaign.update({ where: { id }, data: { status: "APPROVED", scheduledAt: null } });
    await auditCampaign(actor ?? null, "communication.campaign.cancel-schedule", `إلغاء جدولة حملة: ${current.name}`, `Cancelled schedule: ${current.name}`, id, { to: "APPROVED" });
    return { ok: true, data: row };
  } catch (error) {
    console.error("cancelSchedule failed", error);
    return { ok: false, status: 500, error: "Failed to cancel schedule." };
  }
}

/** Return a REVIEW/APPROVED campaign to DRAFT (before any send). Clears approval + schedule. */
export async function returnToDraft(id: string, actor?: Actor): Promise<ServiceResult<CommunicationCampaign>> {
  if (!process.env.DATABASE_URL) return dbUnavailable();
  try {
    const current = await prisma.communicationCampaign.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!current) return { ok: false, status: 404, error: "Campaign not found." };
    if (!["REVIEW", "APPROVED", "SCHEDULED"].includes(current.status)) return { ok: false, status: 409, error: "لا يمكن الإرجاع لمسودة من هذه الحالة." };
    const row = await prisma.communicationCampaign.update({ where: { id }, data: { status: "DRAFT", approvedBy: null, approvedAt: null, scheduledAt: null } });
    await auditCampaign(actor ?? null, "communication.campaign.return-to-draft", `إرجاع حملة لمسودة: ${current.name}`, `Returned campaign to draft: ${current.name}`, id, { from: current.status });
    return { ok: true, data: row };
  } catch (error) {
    console.error("returnToDraft failed", error);
    return { ok: false, status: 500, error: "Failed to return to draft." };
  }
}
