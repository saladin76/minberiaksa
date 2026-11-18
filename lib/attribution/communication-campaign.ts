/**
 * Donations that came from the team's own WhatsApp / email / SMS campaigns carry
 * utm_medium=communication and the internal CommunicationCampaign id in utm_id /
 * utm_campaign (see lib/communication/campaign-attribution-service.ts). This is a
 * display-only helper: it does not change detectDonationSource, ad attribution,
 * analytics aggregates or any conversion tracking.
 */
export const COMMUNICATION_CHANNEL_LABEL_AR: Record<string, string> = {
  whatsapp: "واتساب",
  email: "البريد الإلكتروني",
  sms: "الرسائل النصية",
};

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export interface CommunicationCampaignRef {
  channel: string;
  channelLabel: string;
  campaignId: string | null;
}

export function communicationCampaignRef(attribution: Record<string, unknown> | null | undefined): CommunicationCampaignRef | null {
  const attr = attribution ?? {};
  const text = (key: string) => (typeof attr[key] === "string" ? (attr[key] as string).trim() : "");
  if (text("utm_medium").toLowerCase() !== "communication") return null;
  const channel = text("utm_source").toLowerCase() || "communication";
  const id = [text("utm_id"), text("utm_campaign"), text("campaign_id")].find((value) => OBJECT_ID.test(value)) ?? null;
  return {
    channel,
    channelLabel: COMMUNICATION_CHANNEL_LABEL_AR[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1),
    campaignId: id ? id.toLowerCase() : null,
  };
}
