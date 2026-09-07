import { LOCALES, isKnownLocale, type AnyLocale } from "@/lib/locales";

/**
 * Language coverage for a campaign: given the locales present among recipients and the
 * locales for which an approved template variant exists, decide — per locale — whether
 * it is covered directly, covered by an explicit fallback, or missing. Pure, no I/O.
 *
 * A campaign must not silently send the wrong language: any `MISSING` locale that has
 * recipients should block or require an explicit human decision before sending.
 */

export type CoverageStatus = "EXISTS" | "FALLBACK" | "MISSING";

export type LocaleCoverage = {
  locale: AnyLocale;
  label: string;
  status: CoverageStatus;
  fallbackLocale?: AnyLocale;
  recipientCount: number;
};

export type CampaignLanguageCoverage = {
  locales: LocaleCoverage[];
  missingWithRecipients: LocaleCoverage[];
  canSendWithoutDecision: boolean;
};

function normalizeSet(locales: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of locales) {
    const code = raw?.trim().toLowerCase();
    if (code && isKnownLocale(code)) out.add(code);
  }
  return out;
}

export function computeLanguageCoverage(
  recipientLocaleCounts: Record<string, number>,
  availableTemplateLocales: string[]
): CampaignLanguageCoverage {
  const available = normalizeSet(availableTemplateLocales);

  const locales: LocaleCoverage[] = [];
  for (const [raw, count] of Object.entries(recipientLocaleCounts)) {
    const code = raw.trim().toLowerCase();
    if (!isKnownLocale(code)) continue;
    const meta = LOCALES[code];
    let status: CoverageStatus = "MISSING";
    let fallbackLocale: AnyLocale | undefined;
    if (available.has(code)) {
      status = "EXISTS";
    } else if (available.has(meta.fallbackLocale)) {
      status = "FALLBACK";
      fallbackLocale = meta.fallbackLocale;
    }
    locales.push({ locale: code, label: meta.label, status, fallbackLocale, recipientCount: count });
  }
  locales.sort((a, b) => b.recipientCount - a.recipientCount);

  const missingWithRecipients = locales.filter((l) => l.status === "MISSING" && l.recipientCount > 0);

  return {
    locales,
    missingWithRecipients,
    canSendWithoutDecision: missingWithRecipients.length === 0,
  };
}
