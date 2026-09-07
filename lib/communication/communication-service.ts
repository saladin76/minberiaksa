import { getMessagingOverview } from "@/lib/operations/messaging/messaging-repository";
import { communicationProviderRegistry } from "./provider-registry";
import type { CommunicationChannel, CommunicationProviderKey, CommunicationPurpose, CommunicationTemplate, ProviderConnection } from "./communication-types";

type CommunicationSummary = {
  providers: number;
  templates: number;
  campaigns: number;
  needsReview: number;
  approved: number;
  scheduled: number;
};

export type CommunicationCenterOverview = {
  generatedAt: string;
  providers: ProviderConnection[];
  templates: CommunicationTemplate[];
  summary: CommunicationSummary;
  safety: {
    externalSideEffects: false;
    autoSend: false;
    humanReviewRequired: true;
    note: string;
  };
};

function providerKeyForChannel(channel: CommunicationChannel): CommunicationProviderKey {
  if (channel === "WHATSAPP") return "META_WHATSAPP";
  if (channel === "EMAIL") return "ELASTIC_EMAIL";
  return "BREVO_SMS";
}

function purposeForCategory(category: string): CommunicationPurpose {
  const normalized = category.toLowerCase();
  if (normalized.includes("شكر") || normalized.includes("تأكيد") || normalized.includes("receipt") || normalized.includes("transaction")) return "TRANSACTIONAL";
  return "MARKETING";
}

export async function getCommunicationCenterOverview(): Promise<CommunicationCenterOverview> {
  const messaging = await getMessagingOverview();
  const templates: CommunicationTemplate[] = messaging.templates.map((template) => ({
    id: template.id,
    channel: template.channel,
    purpose: purposeForCategory(template.category),
    providerKey: providerKeyForChannel(template.channel),
    title: template.title,
    language: template.language,
    body: template.body,
    variables: template.variables ?? [],
    reviewStatus: template.status,
    notes: template.notes,
  }));

  return {
    generatedAt: new Date().toISOString(),
    providers: communicationProviderRegistry,
    templates,
    summary: {
      providers: communicationProviderRegistry.length,
      templates: messaging.summary.templates,
      campaigns: messaging.summary.campaigns,
      needsReview: messaging.summary.needsReview,
      approved: messaging.summary.approved,
      scheduled: messaging.summary.scheduled,
    },
    safety: {
      externalSideEffects: false,
      autoSend: false,
      humanReviewRequired: true,
      note: "مركز التواصل يعمل حاليًا كبنية داخلية آمنة: قوالب، مزودين، ومراجعة بشرية بدون أي إرسال خارجي أو مفاتيح API في الواجهة.",
    },
  };
}
