import {
  DEFAULT_LOCALE,
  isValidLocale,
  type SupportedLocale,
} from "@/lib/locales";

export type EmailTranslations = Partial<
  Record<SupportedLocale, { subject?: string; document?: unknown }>
>;

export type WhatsappTranslations = Partial<
  Record<SupportedLocale, { body?: string }>
>;

/**
 * Decide which locale to render a template in for a single recipient.
 * Order: explicit override → recipient's preferredLang → DEFAULT_LOCALE (ar).
 */
export function pickLocale(opts: {
  override?: string | null | undefined;
  recipientLang?: string | null | undefined;
}): SupportedLocale {
  const o = (opts.override ?? "").trim();
  if (o && isValidLocale(o)) return o;
  const r = (opts.recipientLang ?? "").trim();
  if (r && isValidLocale(r)) return r;
  return DEFAULT_LOCALE;
}

/**
 * Resolve the email subject + document for a given locale, falling back to the
 * canonical Arabic fields when a locale variation is missing or empty.
 */
export function resolveEmailVariant(
  template: { subject: string; document: unknown; translations?: unknown },
  locale: SupportedLocale
): { subject: string; document: unknown; resolvedLocale: SupportedLocale } {
  const t = (template.translations ?? null) as EmailTranslations | null;
  if (locale !== DEFAULT_LOCALE && t && t[locale]) {
    const variant = t[locale]!;
    return {
      subject: variant.subject?.trim() ? variant.subject : template.subject,
      document: variant.document ?? template.document,
      resolvedLocale: variant.subject?.trim() || variant.document ? locale : DEFAULT_LOCALE,
    };
  }
  return {
    subject: template.subject,
    document: template.document,
    resolvedLocale: DEFAULT_LOCALE,
  };
}

/**
 * Resolve the whatsapp body for a given locale, falling back to the canonical
 * Arabic body when a locale variation is missing or empty.
 */
export function resolveWhatsappBody(
  template: { body: string; translations?: unknown },
  locale: SupportedLocale
): { body: string; resolvedLocale: SupportedLocale } {
  const t = (template.translations ?? null) as WhatsappTranslations | null;
  if (locale !== DEFAULT_LOCALE && t && t[locale]?.body?.trim()) {
    return { body: t[locale]!.body!, resolvedLocale: locale };
  }
  return { body: template.body, resolvedLocale: DEFAULT_LOCALE };
}
