import type { ElasticEmailRuntimeConfig } from "../elastic-email/client";
import type { EmailAttachmentInput } from "../elastic-email/types";
import { sendElasticEmail, isElasticEmailConfigured } from "../elastic-email/client";
import { ELASTIC_EMAIL_REASONS } from "../elastic-email/errors";
import { emailSuppressionDecision } from "../../email-suppression-store";
import { appendMarketingUnsubscribeFooter, buildEmailUnsubscribeUrl } from "../../email-unsubscribe";

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
  purpose?: "MARKETING" | "TRANSACTIONAL" | "UTILITY" | "AUTHENTICATION" | null;
  locale?: string | null;
  attachments?: EmailAttachmentInput[];
};

export type { EmailAttachmentInput };

export type EmailSendResult =
  | { ok: true; providerId: typeof EMAIL_PROVIDER_ID; providerMessageId: string | null; internalAccepted: boolean }
  | { ok: false; reason: string; detail?: string };

export async function sendEmailMessage(input: EmailSendInput, runtime?: ElasticEmailRuntimeConfig): Promise<EmailSendResult> {
  const purpose = input.purpose ?? "TRANSACTIONAL";
  const suppression = await emailSuppressionDecision(input.to, purpose);
  if (!suppression.allowed) return { ok: false, reason: "EMAIL_SUPPRESSED", detail: `${suppression.reason}:${suppression.scope}` };

  const marketing = purpose === "MARKETING";
  let html = input.html;
  let headers: Record<string, string> | undefined;
  if (marketing) {
    const unsubscribeUrl = await buildEmailUnsubscribeUrl(input.to, input.locale);
    if (unsubscribeUrl) {
      html = appendMarketingUnsubscribeFooter(html, unsubscribeUrl, input.locale);
      headers = {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
  }

  const res = await sendElasticEmail({
    to: input.to,
    subject: input.subject,
    html,
    text: input.text,
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    replyTo: input.replyTo,
    channelName: input.channelName,
    marketing,
    headers,
    attachments: input.attachments,
  }, runtime);
  if (!res.ok) return { ok: false, reason: res.reason, detail: res.detail };
  return { ok: true, providerId: EMAIL_PROVIDER_ID, providerMessageId: res.providerMessageId, internalAccepted: res.internalAccepted };
}
