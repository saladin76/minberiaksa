import type { OperationsPersistenceInfo } from "../persistence-types";

export type DonorReactivationChannel = "WHATSAPP_OR_SMS" | "EMAIL" | "NO_CHANNEL";

export type DonorReactivationActionType =
  | "MARK_MANUALLY_SENT"
  | "SKIP_THIS_MONTH"
  | "DISMISS"
  | "ASSIGN_FOLLOW_UP_TASK";

export type DonorReactivationCandidate = {
  donorId: string;
  donorName: string;
  donorEmail: string | null;
  donorPhone: string | null;
  locale: string;
  channel: DonorReactivationChannel;
  country: string | null;
  lastDonationId: string;
  lastDonationAt: string;
  daysSinceLastDonation: number;
  lastDonationAmount: number;
  lastDonationCurrency: string;
  suggestedMessage: string;
  reason: string;
  blockedReason?: string | null;
};

export type DonorReactivationOverview = {
  source: string;
  generatedAt: string;
  persistence: OperationsPersistenceInfo;
  safety: {
    noAutoSend: true;
    manualOnly: true;
    noExternalCalls: true;
    noAiGeneration: true;
  };
  summary: {
    candidates: number;
    whatsappOrSms: number;
    email: number;
    noChannel: number;
    recentlyHandled: number;
  };
  candidates: DonorReactivationCandidate[];
  recentlyHandledDonorIds: string[];
};

export type DonorReactivationMutationResult = {
  ok: boolean;
  mode: "prisma" | "foundation";
  status: number;
  message: string;
  action?: DonorReactivationActionType;
  taskId?: string;
};
