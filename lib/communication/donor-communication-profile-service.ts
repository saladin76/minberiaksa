import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { DEFAULT_LOCALE, isValidLocale } from "@/lib/locales";
import { localeForCountry } from "@/lib/geo/country-to-locale";
import type { DonorCommunicationProfile } from "@prisma/client";

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

/**
 * DonorCommunicationProfileService — the unified per-donor communication profile.
 *
 * Compatibility, not replacement: consent is derived from the existing User fields
 * (`preferredLang`, `emailNotifications`, `smsNotifications`) plus donation signals.
 * WhatsApp has no explicit consent field on User, so `whatsappOptIn` stays false until a
 * human confirms it — donors are never silently marketing-eligible on WhatsApp.
 *
 * This package provides the profile upsert only. It does NOT auto-run on paid donation
 * (that wiring into the donation flow is a later, separate step) — the donation flow is
 * untouched here.
 */

/** Resolve the donor's locale: preferredLang → donation locale → country-to-locale → default. */
function resolvePreferredLocale(
  preferredLang: string | null,
  donationLocale: string | null,
  countryCode: string | null
): string {
  if (preferredLang && isValidLocale(preferredLang)) return preferredLang;
  if (donationLocale && isValidLocale(donationLocale)) return donationLocale;
  const byCountry = localeForCountry(countryCode ?? null);
  return byCountry ?? DEFAULT_LOCALE;
}

export async function getProfile(userId: string): Promise<DonorCommunicationProfile | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await prisma.donorCommunicationProfile.findUnique({ where: { userId } });
  } catch (error) {
    console.error("getProfile failed", error);
    return null;
  }
}

export type ProfileSyncResult =
  | { ok: true; data: DonorCommunicationProfile }
  | { ok: false; status: number; error: string };

/**
 * Create or refresh a donor's communication profile from the current User row + donation
 * signals. Safe to call repeatedly. No sending, no external calls.
 */
export async function upsertProfileForUser(
  userId: string,
  opts?: { donationLocale?: string | null }
): Promise<ProfileSyncResult> {
  if (!process.env.DATABASE_URL) return { ok: false, status: 503, error: "DATABASE_URL is not configured." };
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        countryCode: true,
        preferredLang: true,
        emailNotifications: true,
        smsNotifications: true,
      },
    });
    if (!user) return { ok: false, status: 404, error: "User not found." };

    const [paidCount, lastPaid] = await Promise.all([
      prisma.donation.count({ where: { donorId: userId, status: "PAID" } }),
      prisma.donation.findFirst({
        where: { donorId: userId, status: "PAID", paidAt: { not: null } },
        orderBy: { paidAt: "desc" },
        select: { paidAt: true },
      }),
    ]);

    const preferredLocale = resolvePreferredLocale(user.preferredLang, opts?.donationLocale ?? null, user.countryCode);
    const existing = await prisma.donorCommunicationProfile.findUnique({ where: { userId }, select: { whatsappOptIn: true } });

    const data = {
      preferredLocale,
      countryCode: user.countryCode ?? null,
      phone: user.phone ?? null,
      email: user.email ?? null,
      // Email/SMS opt-in mirror the existing notification flags (marketing gate).
      emailOptIn: user.email ? user.emailNotifications !== false : false,
      smsOptIn: user.phone ? user.smsNotifications !== false : false,
      // WhatsApp consent is never assumed — keep any existing explicit value, else false.
      whatsappOptIn: existing?.whatsappOptIn ?? false,
      lastDonationAt: lastPaid?.paidAt ?? null,
      totalDonations: paidCount,
    };

    const row = await prisma.donorCommunicationProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("upsertProfileForUser failed", error);
    return { ok: false, status: 500, error: "Failed to sync communication profile." };
  }
}

export type ProfileListFilter = { locale?: string; take?: number };

/** Read-only list of donor communication profiles (backs the preferences page). */
export async function listProfiles(filter: ProfileListFilter = {}): Promise<DonorCommunicationProfile[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await prisma.donorCommunicationProfile.findMany({
      where: filter.locale ? { preferredLocale: filter.locale } : undefined,
      orderBy: { lastDonationAt: "desc" },
      take: Math.min(filter.take ?? 100, 500),
    });
  } catch (error) {
    console.error("listProfiles failed", error);
    return [];
  }
}

export type ConsentPatch = {
  whatsappOptIn?: boolean;
  emailOptIn?: boolean;
  smsOptIn?: boolean;
  doNotContact?: boolean;
  consentSource?: string | null;
};

/**
 * Update a donor's consent flags (the human-confirmed opt-in action). Requires an existing
 * profile. Stamps `lastConsentAt` and audits the change. No sending.
 */
export async function setProfileConsent(userId: string, patch: ConsentPatch, actor?: Actor): Promise<ProfileSyncResult> {
  if (!process.env.DATABASE_URL) return { ok: false, status: 503, error: "DATABASE_URL is not configured." };
  try {
    const existing = await prisma.donorCommunicationProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!existing) return { ok: false, status: 404, error: "Communication profile not found for this donor." };
    const row = await prisma.donorCommunicationProfile.update({
      where: { userId },
      data: {
        whatsappOptIn: patch.whatsappOptIn,
        emailOptIn: patch.emailOptIn,
        smsOptIn: patch.smsOptIn,
        doNotContact: patch.doNotContact,
        consentSource: patch.consentSource ?? "dashboard",
        lastConsentAt: new Date(),
      },
    });
    await writeAuditLog({
      actorId: actor?.actorId ?? undefined,
      actorName: actor?.actorName ?? undefined,
      actorRole: actor?.actorRole ?? "ADMIN",
      action: "communication.profile.consent",
      messageAr: "تم تحديث تفضيلات تواصل متبرع",
      messageEn: "Donor communication consent updated",
      entityType: "DonorCommunicationProfile",
      entityId: row.id,
      metadata: { ...patch, externalCall: false },
      stream: "TEAM",
    });
    return { ok: true, data: row };
  } catch (error) {
    console.error("setProfileConsent failed", error);
    return { ok: false, status: 500, error: "Failed to update consent." };
  }
}

/** Stamp the last time we communicated with a donor on a channel (called by the sender later). */
export async function touchProfileCommunication(
  userId: string,
  channel: "WHATSAPP" | "EMAIL" | "SMS"
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const now = new Date();
  const channelField =
    channel === "WHATSAPP" ? { lastWhatsappAt: now } : channel === "EMAIL" ? { lastEmailAt: now } : { lastSmsAt: now };
  try {
    await prisma.donorCommunicationProfile.updateMany({
      where: { userId },
      data: { lastCommunicationAt: now, ...channelField },
    });
  } catch (error) {
    console.error("touchProfileCommunication failed", error);
  }
}
