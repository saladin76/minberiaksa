import { getCampaign } from "./campaign-service";
import { loadCampaignRecipients, type CampaignRecipient } from "./campaign-recipient-service";
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
  total: number;
  eligible: number;
  skipped: number;
  reasons: Record<string, number>;
  coverage: { ok: boolean; undecided: string[] };
  providerReady: boolean;
  senderReady: boolean;
  willSend: boolean;
  blocked?: string;
  truncated: boolean;
  recipients: CampaignRecipient[];
  skippedList: { userId: string; locale: string; reason: string }[];
};

export async function planCampaignSend(campaignId: string, opts: { batchSize?: number } = {}): Promise<SendPlan> {
  const batchSize = Math.min(opts.batchSize ?? 200, 1000);
  const empty: SendPlan = {
    campaignId, channel: null, status: null, total: 0, eligible: 0, skipped: 0, reasons: {},
    coverage: { ok: false, undecided: [] }, providerReady: false, senderReady: false, willSend: false,
    truncated: false, recipients: [], skippedList: [],
  };
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ...empty, blocked: "NOT_FOUND" };
  empty.status = campaign.status;
  empty.channel = campaign.channel;
  if (!campaign.templateGroupId) return { ...empty, blocked: "NO_TEMPLATE" };
  if (!isCommunicationChannel(campaign.channel)) return { ...empty, blocked: "INVALID_CHANNEL" };
  const channel: CommunicationChannelId = campaign.channel;
  const gate = await evaluateCoverageGate(campaignId);
  const coverage = { ok: gate.ok, undecided: gate.undecided };
  if (!gate.ok) return { ...empty, coverage, blocked: "LANGUAGE_COVERAGE_INCOMPLETE" };
  const { recipients, skipped, truncated } = await loadCampaignRecipients(channel, campaign.audienceSegmentKey, { limit: batchSize });
  const reasons: Record<string, number> = {};
  for (const item of skipped) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  const partial: SendPlan = {
    ...empty, channel, coverage, truncated,
    total: recipients.length + skipped.length, eligible: recipients.length, skipped: skipped.length,
    reasons, recipients, skippedList: skipped,
  };
  if (!recipients.length) return { ...partial, blocked: "NO_ELIGIBLE_RECIPIENTS" };

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
