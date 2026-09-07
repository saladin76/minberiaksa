/** Shared types for the Brevo SMS adapter (email moved to Elastic Email). */

export type BrevoSmsInput = {
  to: string;
  content: string;
  sender?: string | null;
  type?: "transactional" | "marketing";
  tag?: string | null;
  webUrl?: string | null;
};

export type BrevoSendResult =
  | { ok: true; providerMessageId: string | null; internalAccepted: boolean }
  | { ok: false; reason: string; detail?: string };
