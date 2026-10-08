import { prisma } from "@/lib/prisma";
import { transitionCampaign, type CampaignAction } from "./campaign-service";
import { getRecipientBreakdown } from "./campaign-recipient-service";
import { getTemplateAvailableLocales } from "./template-compat";
import { computeLanguageCoverage } from "./language-coverage";
import { isCommunicationChannel } from "./communication-runtime-types";

/** Approval requires template coverage or an explicit fallback/exclude decision. No sends here. */
type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

export type CoverageGate = {
  ok: boolean;
  missingWithRecipients: { locale: string; label: string; recipientCount: number }[];
  undecided: string[];
};

type CoverageDecisions = Record<string, "FALLBACK" | "EXCLUDE">;

/**
 * Human approval checks the full audience. The executor may supply counts from
 * its current server-loaded batch, so it rechecks every candidate's coverage
 * without re-scanning the whole audience before every page. These counts are
 * never accepted from an HTTP request.
 */
export async function evaluateCoverageGate(campaignId: string, batchLocaleCounts?: Record<string, number>): Promise<CoverageGate> {
  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id: campaignId },
    select: { channel: true, templateGroupId: true, audienceSegmentKey: true, metadata: true },
  });
  if (!campaign || !isCommunicationChannel(campaign.channel) || !campaign.templateGroupId) {
    return { ok: false, missingWithRecipients: [], undecided: [] };
  }
  const [recipientLocaleCounts, available] = await Promise.all([
    batchLocaleCounts !== undefined
      ? Promise.resolve(batchLocaleCounts)
      : getRecipientBreakdown(campaign.channel, { locale: campaign.audienceSegmentKey }).then((breakdown) => breakdown.recipientLocaleCounts),
    getTemplateAvailableLocales(campaign.channel, campaign.templateGroupId),
  ]);
  const coverage = computeLanguageCoverage(recipientLocaleCounts, available);
  const decisions = ((campaign.metadata as Record<string, unknown> | null)?.coverageDecisions ?? {}) as CoverageDecisions;
  const missing = coverage.missingWithRecipients.map((m) => ({ locale: m.locale, label: m.label, recipientCount: m.recipientCount }));
  const undecided = missing.filter((m) => !decisions[m.locale]).map((m) => m.locale);
  return { ok: undecided.length === 0, missingWithRecipients: missing, undecided };
}

export type ApprovalResult =
  | { ok: true }
  | { ok: false; status: number; error: string; undecided?: string[] };

export async function submitForReview(campaignId: string, actor?: Actor): Promise<ApprovalResult> {
  const r = await transitionCampaign(campaignId, "SUBMIT_REVIEW", { actor });
  return r.ok ? { ok: true } : { ok: false, status: r.status, error: r.error };
}

export async function approveCampaign(campaignId: string, actor?: Actor): Promise<ApprovalResult> {
  const gate = await evaluateCoverageGate(campaignId);
  if (!gate.ok) {
    return {
      ok: false,
      status: 409,
      error: "لا يمكن الاعتماد قبل تغطية كل اللغات أو اختيار بديل/استبعاد لكل لغة ناقصة.",
      undecided: gate.undecided,
    };
  }
  const r = await transitionCampaign(campaignId, "APPROVE", { actor });
  return r.ok ? { ok: true } : { ok: false, status: r.status, error: r.error };
}

export async function transitionCampaignSafe(campaignId: string, action: CampaignAction, actor?: Actor, scheduledAt?: Date | null): Promise<ApprovalResult> {
  const r = await transitionCampaign(campaignId, action, { actor, scheduledAt });
  return r.ok ? { ok: true } : { ok: false, status: r.status, error: r.error };
}
