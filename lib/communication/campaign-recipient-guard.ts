import { prisma } from "@/lib/prisma";
import { recipientExclusionReason, type AudienceChannel, type RecipientExclusionReason } from "./campaign-audience-accounting";
import { normalizeCampaignContact } from "./campaign-contact-validation";

export type CampaignRecipientGuardResult =
  | { ok: true; contact: string }
  | { ok: false; reason: RecipientExclusionReason | "RECIPIENT_NOT_FOUND" | "RECIPIENT_CONTACT_CHANGED" | "INVALID_EMAIL_FORMAT" | "INVALID_PHONE_FORMAT" | "CONSENT_CHECK_UNAVAILABLE"; unavailable?: boolean };

/**
 * Re-read current contact and consent immediately before the provider call.
 * This also protects recipients released from the quiet-hours queue, whose
 * contact/consent may have changed since they were originally selected.
 * Missing consent never becomes approval, and a read failure never allows send.
 */
export async function checkCampaignRecipientBeforeSend(
  channel: AudienceChannel,
  userId: string,
  plannedContact: string,
): Promise<CampaignRecipientGuardResult> {
  try {
    const donor = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true, phone: true,
        communicationProfile: { select: { doNotContact: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true } },
      },
    });
    if (!donor) return { ok: false, reason: "RECIPIENT_NOT_FOUND" };
    const reason = recipientExclusionReason(donor, channel, donor.communicationProfile);
    if (reason !== null) return { ok: false, reason };
    const current = normalizeCampaignContact(channel, channel === "EMAIL" ? donor.email : donor.phone);
    const planned = normalizeCampaignContact(channel, plannedContact);
    if (!current || !planned) return { ok: false, reason: channel === "EMAIL" ? "INVALID_EMAIL_FORMAT" : "INVALID_PHONE_FORMAT" };
    if (current !== planned) return { ok: false, reason: "RECIPIENT_CONTACT_CHANGED" };
    return { ok: true, contact: current };
  } catch {
    // Distinguish an unavailable verification from an opt-out or bad contact.
    return { ok: false, reason: "CONSENT_CHECK_UNAVAILABLE", unavailable: true };
  }
}
