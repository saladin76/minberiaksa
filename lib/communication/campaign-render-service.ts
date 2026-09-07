import type { CommunicationCampaign } from "@prisma/client";
import { isValidLocale, type SupportedLocale } from "@/lib/locales";
import { renderChannelTemplate, type RenderedTemplate } from "./template-compat";
import { createDeliveryRecord, recordSkippedDelivery } from "./delivery-log-service";
import { resolveProviderForSend } from "./provider-router";
import { isCommunicationChannel, type CommunicationChannelId, type CommunicationPurposeId } from "./communication-runtime-types";

/**
 * Renders campaign templates per locale and creates the delivery archive records. Because no
 * provider adapter is wired yet, every prepared recipient is recorded as RENDERED (ready, not
 * sent) and — when a real send is attempted — as SKIPPED with the provider's not-configured
 * reason. Nothing is ever marked SENT here.
 */

function channelOf(campaign: CommunicationCampaign): CommunicationChannelId | null {
  return isCommunicationChannel(campaign.channel) ? campaign.channel : null;
}

/** Preview one locale's rendered template for a campaign. */
export async function previewCampaignLocale(campaign: CommunicationCampaign, locale: string): Promise<RenderedTemplate | null> {
  const channel = channelOf(campaign);
  if (!channel || !campaign.templateGroupId || !isValidLocale(locale)) return null;
  return renderChannelTemplate(channel, campaign.templateGroupId, locale);
}

export type TestDeliveryResult =
  | { ok: true; deliveryId: string; status: "RENDERED" | "SKIPPED"; reason?: string }
  | { ok: false; status: number; error: string };

/**
 * Create a single TEST delivery record for a campaign in a given locale. Renders the template,
 * then asks the ProviderRouter whether a real send is possible. With no provider configured the
 * record is SKIPPED with the not-configured reason (never SENT, never faked).
 */
export async function createTestDelivery(
  campaign: CommunicationCampaign,
  opts: { locale: string; recipientEmail?: string | null; recipientPhone?: string | null; createdBy?: string | null }
): Promise<TestDeliveryResult> {
  const channel = channelOf(campaign);
  if (!channel) return { ok: false, status: 400, error: "Invalid channel." };
  if (!campaign.templateGroupId) return { ok: false, status: 400, error: "Select a template first." };
  const locale = (isValidLocale(opts.locale) ? opts.locale : "ar") as SupportedLocale;

  const rendered = await renderChannelTemplate(channel, campaign.templateGroupId, locale);
  if (!rendered) return { ok: false, status: 404, error: "Template not found." };

  const base = {
    channel,
    campaignId: campaign.id,
    templateId: campaign.templateGroupId,
    templateName: rendered.templateName,
    recipientEmail: opts.recipientEmail ?? null,
    recipientPhone: opts.recipientPhone ?? null,
    locale,
    purpose: campaign.purpose as CommunicationPurposeId,
    origin: "TEST" as const,
    renderedSubject: rendered.subject,
    renderedBody: rendered.body,
    createdBy: opts.createdBy ?? null,
  };

  // `resolveProviderForSend` is async. Without the await, `decision` was a Promise, so
  // `decision.canSend` was `undefined` and `!undefined` is always true — every test send was
  // recorded as SKIPPED with `reason: undefined`, even once providers were configured.
  const decision = await resolveProviderForSend(channel);
  if (!decision.canSend) {
    const skipped = await recordSkippedDelivery(base, decision.reason);
    if (!skipped.ok) return skipped;
    return { ok: true, deliveryId: skipped.data.id, status: "SKIPPED", reason: decision.reason };
  }

  // (Unreachable until adapters land — kept so the safe path is explicit.)
  const record = await createDeliveryRecord({ ...base, status: "RENDERED" });
  if (!record.ok) return record;
  return { ok: true, deliveryId: record.data.id, status: "RENDERED" };
}
