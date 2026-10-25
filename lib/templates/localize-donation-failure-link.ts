import { isValidLocale, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";

const SUPPORTED_LOCALE_PATTERN = SUPPORTED_LOCALES.join("|");

/**
 * Template text may contain a manually pasted locale URL. Keep the failure page
 * in the same language as the recipient while preserving query strings/tokens.
 * Only the organization's own URL and root-relative URLs are rewritten.
 */
export function localizeDonationFailureLinks(content: string, locale: string): string {
  if (!content || !isValidLocale(locale)) return content;

  const expression = new RegExp(
    `(^|[^A-Za-z0-9.:/-])(https?:\\/\\/(?:www\\.)?minberiaksa\\.org)?\\/(?:${SUPPORTED_LOCALE_PATTERN})\\/donation-failed(?=[?#/\\s"'<>)]|$)`,
    "gi",
  );

  return content.replace(expression, (_match, boundary: string, origin: string | undefined) =>
    `${boundary}${origin ?? ""}/${locale as SupportedLocale}/donation-failed`,
  );
}

/** Normalize authored body and URL buttons together, without touching provider status. */
export function localizeDonationFailureDraft<T extends {
  body: string;
  buttons?: Array<{ url?: string | null }>;
}>(draft: T, locale: string): T {
  return {
    ...draft,
    body: localizeDonationFailureLinks(draft.body, locale),
    ...(draft.buttons ? {
      buttons: draft.buttons.map((button) => ({
        ...button,
        ...(typeof button.url === "string" ? { url: localizeDonationFailureLinks(button.url, locale) } : {}),
      })),
    } : {}),
  } as T;
}
