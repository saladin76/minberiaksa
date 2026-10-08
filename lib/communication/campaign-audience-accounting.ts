/**
 * Audience membership is not delivery eligibility or provider acceptance.
 * Pure helpers: no database writes, provider calls or consent mutation.
 */
export type AudienceChannel = "EMAIL" | "WHATSAPP" | "SMS";
export type RecipientConsent = {
  doNotContact?: boolean;
  emailOptIn?: boolean;
  smsOptIn?: boolean;
  whatsappOptIn?: boolean;
};

export type RecipientExclusionReason =
  | "DO_NOT_CONTACT"
  | "MISSING_CONTACT"
  | "NEEDS_CONSENT_REVIEW"
  | "EMAIL_OPT_IN_REQUIRED"
  | "SMS_OPT_IN_REQUIRED"
  | "WHATSAPP_OPT_IN_REQUIRED";

/**
 * Apply the same legacy donor notification flags that ensureProfilesForUsers
 * uses at send time, without writing records during preview. An existing
 * communication profile always wins; WhatsApp consent is NEVER inferred.
 */
export function previewConsentForLegacyDonor(
  donor: { email?: string | null; phone?: string | null; emailNotifications?: boolean | null; smsNotifications?: boolean | null },
  channel: AudienceChannel,
  profile?: RecipientConsent | null,
): RecipientConsent | null {
  if (profile) return profile;
  if (channel === "EMAIL") return { emailOptIn: Boolean(donor.email) && donor.emailNotifications !== false };
  if (channel === "SMS") return { smsOptIn: Boolean(donor.phone) && donor.smsNotifications !== false };
  return null;
}

/** These are campaign-candidate checks, not a promise of delivery. */
export function recipientExclusionReason(
  donor: { email?: string | null; phone?: string | null },
  channel: AudienceChannel,
  profile?: RecipientConsent | null,
): RecipientExclusionReason | null {
  if (profile?.doNotContact === true) return "DO_NOT_CONTACT";
  const contact = channel === "EMAIL" ? donor.email : donor.phone;
  // Whitespace or malformed non-empty values are validated by the send adapter.
  // This definition deliberately matches the database's null/missing/empty filter.
  if (contact == null || contact === "") return "MISSING_CONTACT";
  if (!profile) return "NEEDS_CONSENT_REVIEW";
  if (channel === "EMAIL" && profile.emailOptIn !== true) return "EMAIL_OPT_IN_REQUIRED";
  if (channel === "SMS" && profile.smsOptIn !== true) return "SMS_OPT_IN_REQUIRED";
  if (channel === "WHATSAPP" && profile.whatsappOptIn !== true) return "WHATSAPP_OPT_IN_REQUIRED";
  return null;
}

export type AudiencePreviewCounts = {
  matched: number;
  eligible: number;
  missingContact: number;
  doNotContact: number;
};

/**
 * The operator selects a database audience, not a pre-authorised subset.
 * Selection never authorises a send; consent and contact are checked individually
 * by the executor. This policy is identical for EMAIL, SMS and WHATSAPP.
 */
export function campaignAudienceSelectionCount(
  _channel: string,
  preview: AudiencePreviewCounts | null | undefined,
): number {
  if (!preview) return 0;
  const value = preview.matched;
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export const RECIPIENT_REASON_LABELS: Record<RecipientExclusionReason, string> = {
  DO_NOT_CONTACT: "طلب إيقاف التواصل",
  MISSING_CONTACT: "لا توجد وسيلة اتصال",
  NEEDS_CONSENT_REVIEW: "موافقة التواصل غير موثقة",
  EMAIL_OPT_IN_REQUIRED: "موافقة البريد غير مؤكدة",
  SMS_OPT_IN_REQUIRED: "موافقة SMS غير مؤكدة",
  WHATSAPP_OPT_IN_REQUIRED: "موافقة واتساب غير مؤكدة",
};
