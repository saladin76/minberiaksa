/** Shared types for the Elastic Email transactional adapter. */

export type ElasticEmailInput = {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  replyTo?: string | null;
  /** Free-form grouping label surfaced in Elastic Email reporting (channel/campaign name). */
  channelName?: string | null;
  trackOpens?: boolean;
  trackClicks?: boolean;
};

export type ElasticEmailSendResult =
  | { ok: true; providerMessageId: string | null; internalAccepted: boolean }
  | { ok: false; reason: string; detail?: string };

/**
 * Build the RFC-5322 `From` header Elastic Email expects: `Name <email>` when a display name is
 * present, otherwise the bare address. Quotes names containing characters that would break the
 * header so the address itself is never corrupted.
 */
export function formatSenderIdentity(email: string, name?: string | null): string {
  const address = email.trim();
  const display = (name ?? "").trim();
  if (!display) return address;
  const needsQuoting = /[",<>@;:\\]/.test(display);
  const safe = display.replace(/[\r\n]/g, " ");
  return needsQuoting ? `"${safe.replace(/(["\\])/g, "\\$1")}" <${address}>` : `${safe} <${address}>`;
}
