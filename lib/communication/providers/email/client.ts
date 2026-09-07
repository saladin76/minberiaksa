import type { ElasticEmailRuntimeConfig } from "../elastic-email/client";
import { sendElasticEmail, isElasticEmailConfigured } from "../elastic-email/client";
import { ELASTIC_EMAIL_REASONS } from "../elastic-email/errors";

/**
 * Channel-level email facade. Email in the final architecture is Elastic Email; callers depend on
 * this module (not the vendor adapter) so a future provider swap stays a one-file change.
 */

export const EMAIL_PROVIDER_ID = "ELASTIC_EMAIL" as const;

export const EMAIL_REASONS = {
  NOT_CONFIGURED: ELASTIC_EMAIL_REASONS.NOT_CONFIGURED,
  SENDER_MISSING_IDENTITY: ELASTIC_EMAIL_REASONS.SENDER_NOT_CONFIGURED,
} as const;

export async function isEmailConfigured(runtime?: ElasticEmailRuntimeConfig): Promise<boolean> {
  return isElasticEmailConfigured(runtime);
}

export type EmailSendInput = {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  replyTo?: string | null;
  channelName?: string | null;
};

export type EmailSendResult =
  | { ok: true; providerId: typeof EMAIL_PROVIDER_ID; providerMessageId: string | null; internalAccepted: boolean }
  | { ok: false; reason: string; detail?: string };

export async function sendEmailMessage(input: EmailSendInput, runtime?: ElasticEmailRuntimeConfig): Promise<EmailSendResult> {
  const res = await sendElasticEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    replyTo: input.replyTo,
    channelName: input.channelName,
  }, runtime);
  if (!res.ok) return { ok: false, reason: res.reason, detail: res.detail };
  return { ok: true, providerId: EMAIL_PROVIDER_ID, providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted };
}
