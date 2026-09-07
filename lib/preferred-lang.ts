import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";

/**
 * Resolve the locale a user just interacted in, in priority order:
 *   1. an explicit `body.locale` field (if the caller passed one)
 *   2. `NEXT_LOCALE` cookie (set by next-intl middleware on every page hit)
 *   3. the locale prefix in the Referer URL path (e.g. /en/donate → "en")
 *   4. DEFAULT_LOCALE ("ar")
 *
 * This is the single source of truth for "what language was the user using".
 * Used at every place the system creates a User row so we never end up with a
 * null preferredLang again.
 */
export function inferLocaleFromRequest(
  req: NextRequest,
  bodyLocale?: string | null
): SupportedLocale {
  const body = (bodyLocale ?? "").toString().trim().toLowerCase();
  if (body && isValidLocale(body)) return body;

  const cookie = req.cookies.get("NEXT_LOCALE")?.value?.toLowerCase().trim();
  if (cookie && isValidLocale(cookie)) return cookie;

  const referer = req.headers.get("referer") ?? "";
  if (referer) {
    try {
      const segments = new URL(referer).pathname.split("/").filter(Boolean);
      const first = (segments[0] ?? "").toLowerCase();
      if (isValidLocale(first)) return first;
    } catch {
      // ignore malformed referer
    }
  }

  return DEFAULT_LOCALE;
}

/** Coerce arbitrary input into a SupportedLocale, defaulting to ar. */
export function coerceLocale(input: unknown): SupportedLocale {
  const s = (input ?? "").toString().trim().toLowerCase();
  return isValidLocale(s) ? s : DEFAULT_LOCALE;
}
