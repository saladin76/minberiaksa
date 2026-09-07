import { prisma } from "@/lib/prisma";
import { transitionCampaign, type CampaignAction } from "./campaign-service";
import { getRecipientBreakdown } from "./campaign-recipient-service";
import { getTemplateAvailableLocales } from "./template-compat";
import { computeLanguageCoverage } from "./language-coverage";
import { isCommunicationChannel } from "./communication-runtime-types";

/**
 * Approval workflow with a language-coverage gate. A campaign can only be APPROVED when every
 * recipient language is covered by a template variant, OR the reviewer has recorded an explicit
 * decision (fallback / exclude) for each missing language in the campaign metadata. This enforces
 * "never silently send the wrong language" before human approval. No sending happens here.
 */

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

export type CoverageGate = {
  ok: boolean;
  missingWithRecipients: { locale: string; label: string; recipientCount: number }[];
  undecided: string[]; // missing locales without an explicit fallback/exclude decision
};

type CoverageDecisions = Record<string, "FALLBACK" | "EXCLUDE">;

/** Evaluate whether a campaign's language coverage is satisfied (directly or via explicit decisions). */
export async function evaluateCoverageGate(campaignId: string): Promise<CoverageGate> {
  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id: campaignId },
    select: { channel: true, templateGroupId: true, audienceSegmentKey: true, metadata: true },
  });
  if (!campaign || !isCommunicationChannel(campaign.channel) || !campaign.templateGroupId) {
    return { ok: false, missingWithRecipients: [], undecided: [] };
  }
  const [breakdown, available] = await Promise.all([
    getRecipientBreakdown(campaign.channel, { locale: campaign.audienceSegmentKey }),
    getTemplateAvailableLocales(campaign.channel, campaign.templateGroupId),
  ]);
  const coverage = computeLanguageCoverage(breakdown.recipientLocaleCounts, available);
  const decisions = ((campaign.metadata as Record<string, unknown> | null)?.coverageDecisions ?? {}) as CoverageDecisions;

  const missing = coverage.missingWithRecipients.map((m) => ({ locale: m.locale, label: m.label, recipientCount: m.recipientCount }));
  const undecided = missing.filter((m) => !decisions[m.locale]).map((m) => m.locale);
  return { ok: undecided.length === 0, missingWithRecipients: missing, undecided };
}

export type ApprovalResult =
  | { ok: true }
  | { ok: false; status: number; error: string; undecided?: string[] };

/** Move DRAFT → REVIEW. */
export async function submitForReview(campaignId: string, actor?: Actor): Promise<ApprovalResult> {
  const r = await transitionCampaign(campaignId, "SUBMIT_REVIEW", { actor });
  return r.ok ? { ok: true } : { ok: false, status: r.status, error: r.error };
}

/** Approve — blocked unless language coverage is satisfied (directly or by explicit decisions). */
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
