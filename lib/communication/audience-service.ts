import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, type SupportedLocale } from "@/lib/locales";
import type { CommunicationChannel } from "./communication-types";
import { safeCountValue } from "@/lib/dashboard/safe-count";
import { recipientExclusionReason } from "./campaign-audience-accounting";
import { previewSmartAudience } from "./smart-audience";

/**
 * Dynamic audiences computed from donors, not manually maintained channel lists.
 * Membership and permission to send are separate. The communication profile is
 * authoritative; no missing preference is turned into an opt-in by this module.
 * Read-only: no writes, no sends, no provider calls.
 */
export type ChannelEligibility = "ELIGIBLE" | "NEEDS_REVIEW" | "UNAVAILABLE";

export type LanguageAudienceSummary = {
  id: string;
  locale: SupportedLocale;
  label: string;
  nativeLabel: string;
  total: number;
  withEmail: number;
  withPhone: number;
  emailEligible: number;
  smsEligible: number;
  /** Preliminary consent/contact eligibility, never guaranteed delivery. */
  whatsappEligible: number;
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
    whatsappEligible: number;
    whatsappNeedsReview: number;
  };
  languages: LanguageAudienceSummary[];
  consentNote: string;
};

const DONOR_BASE = { role: "DONOR" as const };

async function localeCounts(locale: SupportedLocale) {
  const base = { ...DONOR_BASE, preferredLang: locale };
  const [total, withEmail, withPhone, emailEligible, smsEligible, whatsapp] = await Promise.all([
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { ...base, email: { not: null } } }),
    prisma.user.count({ where: { ...base, phone: { not: null } } }),
    safeCountValue("audience.emailReachable", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, email: { not: null }, emailOptIn: true, doNotContact: false } })),
    safeCountValue("audience.smsReachable", () => prisma.donorCommunicationProfile.count({ where: { preferredLocale: locale, phone: { not: null }, smsOptIn: true, doNotContact: false } })),
    previewSmartAudience({ version: 1, kind: "SMART", channel: "WHATSAPP", filters: { locales: [locale], hasContact: false } }, 0),
  ]);
  return { total, withEmail, withPhone, emailEligible, smsEligible, whatsappEligible: whatsapp.eligible, whatsappNeedsReview: whatsapp.needsReview };
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
    consentNote: "حجم الجمهور لا يضمن التسليم. تُحترم موافقة القناة وطلبات إيقاف التواصل، وتُراجع بيانات الاتصال عند التنفيذ.",
  };
}

/** Same preliminary policy as preview accounting and recipient skip reasons. */
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
  const reason = recipientExclusionReason(donor, channel, profile);
  if (reason === null) return "ELIGIBLE";
  if (reason === "NEEDS_CONSENT_REVIEW") return "NEEDS_REVIEW";
  return "UNAVAILABLE";
}
