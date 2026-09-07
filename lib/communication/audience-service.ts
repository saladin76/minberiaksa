import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannel } from "./communication-types";
import { safeCountValue } from "@/lib/dashboard/safe-count";

/**
 * Dynamic audiences — computed live from the donor base (`User`), never a manual
 * per-channel list. Language comes from `User.preferredLang`; channel eligibility is
 * derived from existing fields with lawful-safe defaults:
 *   - EMAIL  : has email AND emailNotifications !== false
 *   - SMS    : has phone AND smsNotifications !== false
 *   - WHATSAPP: has phone → NEEDS_REVIEW (no WhatsApp marketing-consent field exists,
 *               so donors are never silently bulk-eligible; a human must confirm consent)
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
  /** Donors with an explicit WhatsApp opt-in on their communication profile. */
  whatsappEligible: number;
  /** Phone contacts without an explicit WhatsApp opt-in — need human review before bulk send. */
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
  const [total, withEmail, withPhone, emailEligible, smsEligible, whatsappEligible] = await Promise.all([
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { ...base, email: { not: null } } }),
    prisma.user.count({ where: { ...base, phone: { not: null } } }),
    // Email/SMS eligibility from the notification flags (the runtime profile mirrors these).
    prisma.user.count({ where: { ...base, email: { not: null }, emailNotifications: true } }),
    prisma.user.count({ where: { ...base, phone: { not: null }, smsNotifications: true } }),
    // WhatsApp is only eligible with an explicit opt-in on the donor communication profile.
    safeCountValue("audience.whatsappReachable", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, whatsappOptIn: true, doNotContact: false } })),
  ]);
  // Phone contacts without an explicit opt-in still need human review before any bulk WhatsApp.
  const whatsappNeedsReview = Math.max(0, withPhone - whatsappEligible);
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
      "أهلية القنوات تُشتق من تفضيلات الإشعارات المسجّلة. لا توجد موافقة تسويقية صريحة لواتساب بعد، لذلك يظهر المتبرعون كـ«يحتاج مراجعة» ولا يُرسل لهم جماعيًا دون موافقة.",
  };
}

/**
 * Whether a donor is eligible on a channel for marketing. Prefers the runtime
 * DonorCommunicationProfile when present, falling back to the legacy User flags.
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
    const optedIn = profile ? profile.emailOptIn === true : donor.emailNotifications !== false;
    return optedIn ? "ELIGIBLE" : "UNAVAILABLE";
  }
  if (channel === "SMS") {
    if (!donor.phone) return "UNAVAILABLE";
    const optedIn = profile ? profile.smsOptIn === true : donor.smsNotifications !== false;
    return optedIn ? "ELIGIBLE" : "UNAVAILABLE";
  }
  // WHATSAPP — eligible only with an explicit opt-in; otherwise phone contacts need review.
  if (profile?.whatsappOptIn) return "ELIGIBLE";
  return donor.phone ? "NEEDS_REVIEW" : "UNAVAILABLE";
}
