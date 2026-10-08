import { prisma } from "@/lib/prisma";
import { recipientExclusionReason, type AudienceChannel } from "./campaign-audience-accounting";
import { normalizeCampaignContact } from "./campaign-contact-validation";

export type RetryRecipientInput = {
  id?: string;
  channel: string; purpose: string; campaignId: string | null;
  recipientUserId: string | null; recipientEmail: string | null; recipientPhone: string | null;
};
export type RetryRecipientCode = "NO_RECIPIENT" | "RECIPIENT_NOT_FOUND" | "RECIPIENT_CONTACT_CHANGED" | "INVALID_CONTACT" | "RECIPIENT_CHECK_UNAVAILABLE" | "CONSENT_BLOCKED" | "DELIVERY_OUTCOME_UNCERTAIN";
export type RetryRecipientCheck = { ok: true; contact: string } | { ok: false; code: RetryRecipientCode };

/** Recheck live delivery evidence, destination and preferences without writes or sends. */
export async function checkRetryRecipient(row: RetryRecipientInput, plannedContact?: string): Promise<RetryRecipientCheck> {
  const channel = row.channel as AudienceChannel;
  const stored = channel === "EMAIL" ? row.recipientEmail : row.recipientPhone;
  try {
    if (row.id) {
      const evidence = await prisma.communicationDelivery.findUnique({ where: { id: row.id }, select: { errorMessage: true } });
      if (!evidence) return { ok: false, code: "RECIPIENT_CHECK_UNAVAILABLE" };
      // A campaign executor may have lost the provider response. A FAILED row
      // alone is not evidence that nothing arrived, so do not resend it blindly.
      if (/^(DELIVERY_OUTCOME_UNCERTAIN|SEND_THREW|NETWORK_ERROR|TIMEOUT|HTTP_5\d\d)(?:\b|:)/.test(evidence.errorMessage ?? "")) {
        return { ok: false, code: "DELIVERY_OUTCOME_UNCERTAIN" };
      }
    }
    if (!row.recipientUserId) {
      if (row.campaignId) return { ok: false, code: "RECIPIENT_CHECK_UNAVAILABLE" };
      const contact = normalizeCampaignContact(channel, stored);
      if (!contact) return { ok: false, code: stored ? "INVALID_CONTACT" : "NO_RECIPIENT" };
      if (plannedContact !== undefined && normalizeCampaignContact(channel, plannedContact) !== contact) return { ok: false, code: "RECIPIENT_CONTACT_CHANGED" };
      return { ok: true, contact };
    }
    const donor = await prisma.user.findUnique({
      where: { id: row.recipientUserId },
      select: { email: true, phone: true, communicationProfile: { select: { doNotContact: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true } } },
    });
    if (!donor) return { ok: false, code: "RECIPIENT_NOT_FOUND" };
    const profile = donor.communicationProfile;
    if (profile?.doNotContact === true) return { ok: false, code: "CONSENT_BLOCKED" };
    if (row.campaignId) {
      const reason = recipientExclusionReason(donor, channel, profile);
      if (reason) return { ok: false, code: reason === "MISSING_CONTACT" ? "NO_RECIPIENT" : "CONSENT_BLOCKED" };
    } else if (row.purpose === "MARKETING" && channel !== "WHATSAPP") {
      const allowed = channel === "EMAIL" ? profile?.emailOptIn : profile?.smsOptIn;
      if (allowed !== true) return { ok: false, code: "CONSENT_BLOCKED" };
    }
    const raw = channel === "EMAIL" ? donor.email : donor.phone;
    if (!raw) return { ok: false, code: "NO_RECIPIENT" };
    const contact = normalizeCampaignContact(channel, raw);
    if (!contact) return { ok: false, code: "INVALID_CONTACT" };
    const expected = plannedContact !== undefined ? plannedContact : stored;
    if (expected) {
      const normalized = normalizeCampaignContact(channel, expected);
      if (!normalized) return { ok: false, code: "INVALID_CONTACT" };
      if (normalized !== contact) return { ok: false, code: "RECIPIENT_CONTACT_CHANGED" };
    }
    return { ok: true, contact };
  } catch {
    return { ok: false, code: "RECIPIENT_CHECK_UNAVAILABLE" };
  }
}

export function retryDefinitelyNotSent(reason: string): boolean {
  return reason.endsWith("_NOT_CONFIGURED") || reason.endsWith("_NOT_IMPLEMENTED") ||
    reason.startsWith("SENDER_MISSING_") || reason.includes("_SENDER_MISSING_") ||
    reason.startsWith("TEMPLATE_") || reason === "META_TEMPLATE_REQUIRED" ||
    ["PROVIDER_DISABLED", "EMAIL_SUPPRESSED", "INTEGRATION_DECRYPTION_FAILED", "INTEGRATION_DATABASE_UNAVAILABLE"].includes(reason);
}
