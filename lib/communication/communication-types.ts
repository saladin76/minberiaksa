import type {
  ActiveCommunicationProviderId,
  CommunicationChannelId,
  CommunicationPurposeId,
  DeliveryStatusId,
} from "./communication-runtime-types";

/**
 * UI/repository DTOs for the Communication Center.
 *
 * Runtime identifiers come from communication-runtime-types.ts. Do not duplicate provider,
 * channel, purpose, or delivery-status vocabularies in this file.
 */
export type CommunicationChannel = CommunicationChannelId;
export type CommunicationPurpose = CommunicationPurposeId;
export type CommunicationProviderKey = ActiveCommunicationProviderId;
export type DeliveryStatus = DeliveryStatusId;

export type ProviderConnectionStatus = "NOT_CONFIGURED" | "CONFIGURED" | "NEEDS_ATTENTION" | "DISABLED";
export type TemplateReviewStatus = "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "ARCHIVED";
export type FlowStatus = "DRAFT" | "ACTIVE" | "PAUSED";

export type ProviderConnection = {
  key: CommunicationProviderKey;
  channel: CommunicationChannel;
  name: string;
  status: ProviderConnectionStatus;
  isPrimary: boolean;
  supportsTransactional: boolean;
  supportsMarketing: boolean;
  lastHealthCheckAt?: string | null;
  lastTestAt?: string | null;
  notes?: string | null;
};

export type CommunicationTemplate = {
  id: string;
  channel: CommunicationChannel;
  purpose: CommunicationPurpose;
  providerKey: CommunicationProviderKey;
  title: string;
  language: string;
  body: string;
  variables: string[];
  reviewStatus: TemplateReviewStatus;
  providerTemplateId?: string | null;
  notes?: string | null;
};

export type ContactPreference = {
  contactId: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
  whatsappOptIn: boolean;
  preferredLanguage?: string | null;
  countryCode?: string | null;
  doNotContact: boolean;
  consentSource?: string | null;
  lastConsentAt?: string | null;
};

export type TransactionalFlow = {
  id: string;
  eventKey: string;
  title: string;
  status: FlowStatus;
  steps: TransactionalFlowStep[];
};

export type TransactionalFlowStep = {
  id: string;
  channel: CommunicationChannel;
  providerKey: CommunicationProviderKey;
  templateId: string;
  delayMinutes: number;
  requiresConsent: boolean;
  fallbackProviderKey?: CommunicationProviderKey | null;
};

export type DeliveryLog = {
  id: string;
  purpose: CommunicationPurpose;
  channel: CommunicationChannel;
  providerKey: CommunicationProviderKey;
  templateId?: string | null;
  flowId?: string | null;
  contactId?: string | null;
  recipientMasked: string;
  status: DeliveryStatus;
  providerMessageId?: string | null;
  failureReason?: string | null;
  costEstimate?: number | null;
  createdAt: string;
  updatedAt: string;
};
