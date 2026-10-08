import { getCampaign } from "./campaign-service";
import { countCampaignAudience, loadCampaignRecipients, type CampaignRecipient } from "./campaign-recipient-service";
import { evaluateCoverageGate } from "./campaign-approval-service";
import { listSenders } from "./sender-service";
import { getActiveCommunicationRuntimeBundle } from "./runtime-config";
import { isSendEnabled } from "./provider-router";
import { resolveSmsProviderWithRuntime } from "./providers/sms/client";
import { isCommunicationChannel, type CommunicationChannelId } from "./communication-runtime-types";

export type SendPlan = {
  campaignId: string;
  channel: string | null;
  status: string | null;
  /** Contacts in this batch, including explicit skips. */
  total: number;
  /** Full selected audience, not guaranteed delivery. */
  audienceTotal: number;
  eligible: number;
  skipped: number;
  reasons: Record<string, number>;
  coverage: { ok: boolean; undecided: string[] };
  providerReady: boolean;
  senderReady: boolean;
  willSend: boolean;
  blocked?: string;
  truncated: boolean;
  nextCursor: string | null;
  exhausted: boolean;
  recipients: CampaignRecipient[];
  skippedList: { cursorId: string; userId: string; locale: string; reason: string }[];
};

/** Build one page. The executor persists its cursor, including all-skipped pages. */
export async function planCampaignSend(campaignId: string, opts: { batchSize?: number; cursor?: string | null } = {}): Promise<SendPlan> {
  const batchSize = Math.min(opts.batchSize ?? 200, 1000);
  const empty: SendPlan = {
    campaignId, channel: null, status: null, total: 0, audienceTotal: 0, eligible: 0, skipped: 0, reasons: {},
    coverage: { ok: false, undecided: [] }, providerReady: false, senderReady: false, willSend: false,
    truncated: false, nextCursor: opts.cursor ?? null, exhausted: true, recipients: [], skippedList: [],
  };
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ...empty, blocked: "NOT_FOUND" };
  empty.status = campaign.status;
  empty.channel = campaign.channel;
  if (!campaign.templateGroupId) return { ...empty, blocked: "NO_TEMPLATE" };
  if (!isCommunicationChannel(campaign.channel)) return { ...empty, blocked: "INVALID_CHANNEL" };
  const channel: CommunicationChannelId = campaign.channel;
  const [{ recipients, skipped, truncated, nextCursor, exhausted }, audienceTotal] = await Promise.all([
    loadCampaignRecipients(channel, campaign.audienceSegmentKey, { limit: batchSize, cursor: opts.cursor ?? null }),
    countCampaignAudience(campaign.audienceSegmentKey),
  ]);
  const reasons: Record<string, number> = {};
  for (const item of skipped) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  const batchLocaleCounts: Record<string, number> = {};
  for (const recipient of recipients) batchLocaleCounts[recipient.locale] = (batchLocaleCounts[recipient.locale] ?? 0) + 1;
  const gate = await evaluateCoverageGate(campaignId, batchLocaleCounts);
  const coverage = { ok: gate.ok, undecided: gate.undecided };
  const partial: SendPlan = {
    ...empty, channel, coverage, truncated, nextCursor, exhausted, audienceTotal,
    total: recipients.length + skipped.length, eligible: recipients.length, skipped: skipped.length,
    reasons, recipients, skippedList: skipped,
  };
  if (!gate.ok) return { ...partial, blocked: "LANGUAGE_COVERAGE_INCOMPLETE" };

  if (!recipients.length) {
    // A final all-skipped page still needs to be archived. Previously it was
    // treated as exhausted before the executor recorded its rows and reasons.
    // No provider readiness is claimed and no provider call is needed for skips.
    if (skipped.length > 0 || !exhausted) return { ...partial, willSend: false };
    return { ...partial, blocked: opts.cursor ? "AUDIENCE_EXHAUSTED" : "NO_ELIGIBLE_RECIPIENTS" };
  }

  const runtime = await getActiveCommunicationRuntimeBundle();
  if (channel === "SMS") {
    let trCount = 0;
    let intlCount = 0;
    let missingTR = false;
    let missingIntl = false;
    for (const recipient of recipients) {
      const route = resolveSmsProviderWithRuntime(runtime, recipient.country, recipient.phone);
      if (route.provider === "NETGSM_SMS") {
        trCount += 1;
        if (!route.configured) missingTR = true;
      } else {
        intlCount += 1;
        if (!route.configured) missingIntl = true;
      }
    }
    if (missingTR || missingIntl) {
      const smsReasons = { ...reasons };
      if (missingTR) smsReasons[runtime.netgsm.reason ?? "NETGSM_NOT_CONFIGURED"] = trCount;
      if (missingIntl) smsReasons[runtime.brevoSms.reason ?? "BREVO_SMS_NOT_CONFIGURED"] = intlCount;
      const blocked = missingTR && missingIntl ? "SMS_PROVIDER_NOT_CONFIGURED" : missingTR ? runtime.netgsm.reason ?? "NETGSM_NOT_CONFIGURED" : runtime.brevoSms.reason ?? "BREVO_SMS_NOT_CONFIGURED";
      return { ...partial, reasons: smsReasons, providerReady: false, senderReady: false, blocked };
    }
    return { ...partial, providerReady: true, senderReady: true, willSend: true };
  }

  const providerReady = await isSendEnabled(channel, runtime);
  if (!providerReady) {
    const blocked = channel === "WHATSAPP" ? runtime.meta.reason : runtime.elasticEmail.reason;
    return { ...partial, providerReady: false, blocked: blocked ?? "PROVIDER_NOT_CONFIGURED" };
  }
  const senders = await listSenders();
  const senderReady = channel === "EMAIL"
    ? !!(senders.find((sender) => sender.channel === "EMAIL" && sender.enabled)?.senderEmail || (runtime.elasticEmail.configured && runtime.elasticEmail.values.senderEmail))
    : senders.some((sender) => sender.channel === channel && sender.enabled && sender.status === "ACTIVE" && !!sender.phoneNumberId) || (runtime.meta.configured && !!runtime.meta.values.defaultPhoneNumberId);
  if (!senderReady) return { ...partial, providerReady, senderReady: false, blocked: "NO_SENDER_AVAILABLE" };
  return { ...partial, providerReady, senderReady: true, willSend: true };
}
