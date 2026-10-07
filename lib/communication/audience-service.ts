import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannel } from "./communication-types";
import { safeCountValue } from "@/lib/dashboard/safe-count";

/**
 * Dynamic audiences  computed live from the donor base (`User`), never a manual
 * per-channel list. Language comes from `User.preferredLang`; channel eligibility is
 * derived from existing fields with lawful-safe defaults:
 * DonorCommunicationProfile is the sole runtime source of consent. Legacy User notification flags
 * bootstrap only a missing profile; they never override an existing recorded preference.
 *
 * Read-only: no writes, no sends, no provider calls.
 */

export type ChannelEligibility = "ELIGIBLE" | "NEEDS_REVIEW" | "UNAVAILABLE";

export type LanguageAudienceSummary = {
  id: string;
  locale: SupportedLocale;
  label: string;
  nativeLabel: string;
  /** Total donors whose preferredLang is this locale. */
  total: number;
  withEmail: number;
  withPhone: number;
  /** Marketing eligibility counts per channel. */
  emailEligible: number;
  smsEligible: number;
  /** Donors with a phone who are not explicitly marked do-not-contact. */
  whatsappEligible: number;
  /** Kept for dashboard compatibility; WhatsApp donor audiences no longer require manual review. */
  whatsappNeedsReview: number;
};

export type AudienceOverview = {
  generatedAt: string;
  totals: {
    donors: number;
    withLanguage: number;
    unspecifiedLanguage: number;
    emailEligible: number;
    smsEligible: number;
    whatsappNeedsReview: number;
  };
  languages: LanguageAudienceSummary[];
  consentNote: string;
};

const DONOR_BASE = { role: "DONOR" as const };

/** Count donors for a locale + per-channel eligibility (legacy User flags + WhatsApp opt-in profiles). */
async function localeCounts(locale: SupportedLocale) {
  const base = { ...DONOR_BASE, preferredLang: locale };
  const [total, withEmail, withPhone, emailEligible, smsEligible, whatsappBlocked] = await Promise.all([
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { ...base, email: { not: null } } }),
    prisma.user.count({ where: { ...base, phone: { not: null } } }),
    safeCountValue("audience.emailReachable", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, email: { not: null }, emailOptIn: true, doNotContact: false } })),
    safeCountValue("audience.smsReachable", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, phone: { not: null }, smsOptIn: true, doNotContact: false } })),
    safeCountValue("audience.whatsappBlocked", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, phone: { not: null }, doNotContact: true } })),
  ]);
  const whatsappEligible = Math.max(0, withPhone - whatsappBlocked);
  const whatsappNeedsReview = 0;
  return { total, withEmail, withPhone, emailEligible, smsEligible, whatsappEligible, whatsappNeedsReview };
}

export async function getAudienceOverview(): Promise<AudienceOverview> {
  const perLocale = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => ({ locale, counts: await localeCounts(locale) }))
  );

  const [donors, withLanguage] = await Promise.all([
    prisma.user.count({ where: DONOR_BASE }),
    prisma.user.count({ where: { ...DONOR_BASE, preferredLang: { in: [...SUPPORTED_LOCALES] } } }),
  ]);

  const languages: LanguageAudienceSummary[] = perLocale.map(({ locale, counts }) => ({
    id: `lang-${locale}`,
    locale,
    label: LOCALES[locale].label,
    nativeLabel: LOCALES[locale].nativeLabel,
    ...counts,
  }));

  const totals = {
    donors,
    withLanguage,
    unspecifiedLanguage: Math.max(0, donors - withLanguage),
    emailEligible: languages.reduce((sum, l) => sum + l.emailEligible, 0),
    smsEligible: languages.reduce((sum, l) => sum + l.smsEligible, 0),
    whatsappEligible: languages.reduce((sum, l) => sum + l.whatsappEligible, 0),
    whatsappNeedsReview: languages.reduce((sum, l) => sum + l.whatsappNeedsReview, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    totals,
    languages,
    consentNote:
      "متبرعو واتساب الذين لديهم رقم صالح يُعتبرون مؤهلين داخليًا للإرسال ما لم يكن التواصل موقوفًا عليهم.",
  };
}

/**
 * Whether a donor is eligible on a channel for marketing. DonorCommunicationProfile is authoritative.
 * Missing profile = NEEDS_REVIEW; legacy User flags are not consulted here.
 */
export function donorChannelEligibility(
  donor: { email?: string | null; phone?: string | null; emailNotifications?: boolean; smsNotifications?: boolean },
  channel: CommunicationChannel,
  profile?: {
    doNotContact?: boolean;
    emailOptIn?: boolean;
    smsOptIn?: boolean;
    whatsappOptIn?: boolean;
  } | null
): ChannelEligibility {
  if (profile?.doNotContact) return "UNAVAILABLE";

  if (channel === "EMAIL") {
    if (!donor.email) return "UNAVAILABLE";
    if (!profile) return "NEEDS_REVIEW";
    return profile.emailOptIn === true ? "ELIGIBLE" : "UNAVAILABLE";
  }
  if (channel === "SMS") {
    if (!donor.phone) return "UNAVAILABLE";
    if (!profile) return "NEEDS_REVIEW";
    return profile.smsOptIn === true ? "ELIGIBLE" : "UNAVAILABLE";
  }
  if (!donor.phone) return "UNAVAILABLE";
  return "ELIGIBLE";
}
