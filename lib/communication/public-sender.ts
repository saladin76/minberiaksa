import type { listSenders } from "@/lib/communication/sender-service";

/**
 * What the dashboard is allowed to see about one sender. Lives here, not in the
 * senders route: a Next route file may export only its handlers and config, and
 * the `[id]` and `verify` routes need the same shape.
 */
export function publicSender(row: Awaited<ReturnType<typeof listSenders>>[number]) {
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    name: row.name,
    displayName: row.displayName,
    displayPhoneNumber: row.displayPhoneNumber,
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.businessAccountId,
    hasPhoneNumberId: Boolean(row.phoneNumberId),
    senderEmail: row.senderEmail,
    smsSender: row.smsSender,
    supportedLocales: row.supportedLocales,
    supportedCountries: row.supportedCountries,
    supportedPurposes: row.supportedPurposes,
    status: row.status,
    qualityRating: row.qualityRating,
    isDefault: row.isDefault,
    enabled: row.enabled,
    priority: row.priority,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}
