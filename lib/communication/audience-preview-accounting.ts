import {
  recipientExclusionReason,
  type AudienceChannel,
  type RecipientConsent,
  type RecipientExclusionReason,
} from "./campaign-audience-accounting";

export type AudienceAccountingRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: string;
  countryCode: string | null;
  communicationProfile?: RecipientConsent | null;
};

export type AudienceAccountingSample = Omit<AudienceAccountingRow, "communicationProfile"> & {
  eligible: boolean;
  exclusionReason: RecipientExclusionReason | null;
};

export type AudienceLocaleCounts = {
  total: number;
  eligible: number;
  missingContact: number;
  doNotContact: number;
  needsReview: number;
};

/** Mutually exclusive categories, in this order: DNC, missing contact, consent, eligible. */
export type AudienceAccountingResult = {
  matched: number;
  eligible: number;
  missingContact: number;
  doNotContact: number;
  needsReview: number;
  unavailable: number;
  languages: Record<string, number>;
  eligibleLanguages: Record<string, number>;
  localeBreakdown: Record<string, AudienceLocaleCounts>;
  reasons: Partial<Record<RecipientExclusionReason, number>>;
  sample: AudienceAccountingSample[];
};

/**
 * Server-side, bounded-memory accounting. The caller supplies cursor-paged rows;
 * only the requested sample is retained. Missing MongoDB fields, explicit nulls
 * and empty strings all pass through the same policy used by the send loader.
 * A failed page rejects the whole preview instead of manufacturing zero counts.
 * No writes, consent inference, contact validation or provider calls happen here.
 */
export async function summarizeCampaignAudience(
  rows: AsyncIterable<AudienceAccountingRow>,
  channel: AudienceChannel,
  sampleLimit = 50,
  signal?: AbortSignal,
): Promise<AudienceAccountingResult> {
  const result: AudienceAccountingResult = {
    matched: 0, eligible: 0, missingContact: 0, doNotContact: 0,
    needsReview: 0, unavailable: 0,
    languages: {}, eligibleLanguages: {}, localeBreakdown: {}, reasons: {}, sample: [],
  };
  const sampleSize = Number.isFinite(sampleLimit) ? Math.max(0, Math.min(50, Math.floor(sampleLimit))) : 50;
  let previousId: string | null = null;
  for await (const row of rows) {
    signal?.throwIfAborted();
    if (previousId !== null && row.id <= previousId) throw new Error("AUDIENCE_CURSOR_NOT_ADVANCING");
    previousId = row.id;
    const reason = recipientExclusionReason(row, channel, row.communicationProfile);
    result.matched += 1;
    result.languages[row.locale] = (result.languages[row.locale] ?? 0) + 1;
    const bucket = result.localeBreakdown[row.locale] ?? {
      total: 0, eligible: 0, missingContact: 0, doNotContact: 0, needsReview: 0,
    };
    bucket.total += 1;
    if (reason === null) {
      result.eligible += 1;
      bucket.eligible += 1;
      result.eligibleLanguages[row.locale] = (result.eligibleLanguages[row.locale] ?? 0) + 1;
    } else {
      result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
      if (reason === "DO_NOT_CONTACT") { result.doNotContact += 1; bucket.doNotContact += 1; }
      else if (reason === "MISSING_CONTACT") { result.missingContact += 1; bucket.missingContact += 1; }
      else { result.needsReview += 1; bucket.needsReview += 1; }
    }
    result.localeBreakdown[row.locale] = bucket;
    if (result.sample.length < sampleSize) {
      result.sample.push({
        id: row.id, name: row.name, email: row.email, phone: row.phone,
        locale: row.locale, countryCode: row.countryCode,
        eligible: reason === null, exclusionReason: reason,
      });
    }
  }
  signal?.throwIfAborted();
  result.unavailable = result.matched - result.eligible;
  if (result.matched !== result.eligible + result.missingContact + result.doNotContact + result.needsReview) {
    throw new Error("AUDIENCE_ACCOUNTING_MISMATCH");
  }
  return result;
}
