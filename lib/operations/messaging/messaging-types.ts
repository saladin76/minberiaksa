export type MessagingChannel = "WHATSAPP" | "EMAIL" | "SMS";
export type MessagingTemplateStatus = "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "ARCHIVED";
export type MessagingCampaignStatus = "PLANNING" | "READY_FOR_REVIEW" | "APPROVED" | "SCHEDULED" | "MANUAL_SENT" | "CANCELLED";

export type MessagingTemplate = {
  id: string;
  title: string;
  channel: MessagingChannel;
  category: string;
  language: string;
  body: string;
  cta?: string | null;
  variables?: string[];
  status: MessagingTemplateStatus;
  owner?: string | null;
  notes?: string | null;
};

export type MessagingCampaign = {
  id: string;
  title: string;
  channel: MessagingChannel;
  objective: string;
  audience: string;
  templateId?: string | null;
  scheduledAt?: string | null;
  status: MessagingCampaignStatus;
  owner?: string | null;
  notes?: string | null;
  lastManualStatus?: string | null;
  lastManualAt?: string | null;
};

export type MessagingOverview = {
  generatedAt: string;
  templates: MessagingTemplate[];
  campaigns: MessagingCampaign[];
  summary: {
    templates: number;
    campaigns: number;
    needsReview: number;
    approved: number;
    scheduled: number;
    manualSent: number;
  };
  safety: {
    externalSideEffects: false;
    autoSend: false;
    humanReviewRequired: true;
    note: string;
  };
};
