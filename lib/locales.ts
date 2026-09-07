/**
 * Single source of truth for locales across the app (i18n routing, middleware,
 * public pages, dashboard CRUD, messaging, audiences, templates).
 *
 * Two tiers:
 *  - ENABLED / PUBLIC locales (`SUPPORTED_LOCALES`) — fully translated, routed on
 *    the public site, valid for `User.preferredLang`. This is the exact set the
 *    public router and message loader use.
 *  - REGISTERED but disabled locales (`FUTURE_LOCALES`) — known to the
 *    messaging / audience / template layers so those systems are multilingual
 *    aware, but NOT publicly routed yet (no `messages/<code>.json`, so enabling
 *    them in the router would 500 / break the build). Flip `enabled: true` in
 *    `LOCALES` and add the message file + static import in `app/[locale]/layout.tsx`
 *    to promote one to public.
 *
 * To add a PUBLIC locale you still touch a few non-importable sources — the
 * canonical checklist lives in `docs/implementation-packages/locale-foundation.md`.
 * Everything that CAN import this module should, so the enabled set never drifts.
 */

/**
 * Enabled / public locales. Order is significant (drives dropdowns + routing)
 * and is the order the locked Minbar design ships in `Header.dc.html`
 * → `Component.LANGS`, so the language picker reads as designed.
 */
export const SUPPORTED_LOCALES = [
  "ar",
  "tr",
  "en",
  "fr",
  "de",
  "es",
  "id",
  "pt",
  "ur",
  "sq",
  "it",
  "nl",
  "sv",
  "no",
  "da",
  "ms",
  "ja",
  "zh",
  "hi",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Registered but not yet publicly routed. Empty since the Minbar handoff landed
 * complete `i18n/<lang>/` bundles for all 19 languages (Core Website
 * Localization Pass) and every one of them is now routed.
 */
export const FUTURE_LOCALES = [] as const;

/** Every locale the platform knows about (enabled + future). */
export const ALL_LOCALES = [...SUPPORTED_LOCALES, ...FUTURE_LOCALES] as const;

export type AnyLocale = (typeof ALL_LOCALES)[number];

export type LocaleDirection = "rtl" | "ltr";

export interface LocaleMeta {
  /** ISO code used in routes, cookies, `preferredLang`, template variants. */
  code: AnyLocale;
  /** Latin / dashboard-facing label (kept identical to the historical labels). */
  label: string;
  /** Endonym — the language's own name, for public language pickers. */
  nativeLabel: string;
  direction: LocaleDirection;
  /** Locale to fall back to when a translation/variant is missing. */
  fallbackLocale: SupportedLocale;
  /** Whether the locale is publicly routed and fully translated. */
  enabled: boolean;
}

/**
 * The catalog. `label` values for the 8 enabled locales are unchanged from the
 * previous `LOCALE_LABELS` so no existing UI copy shifts.
 */
export const LOCALES: Record<AnyLocale, LocaleMeta> = {
  ar: { code: "ar", label: "العربية", nativeLabel: "العربية", direction: "rtl", fallbackLocale: "ar", enabled: true },
  en: { code: "en", label: "English", nativeLabel: "English", direction: "ltr", fallbackLocale: "en", enabled: true },
  fr: { code: "fr", label: "Français", nativeLabel: "Français", direction: "ltr", fallbackLocale: "en", enabled: true },
  tr: { code: "tr", label: "Türkçe", nativeLabel: "Türkçe", direction: "ltr", fallbackLocale: "en", enabled: true },
  id: { code: "id", label: "Indonesia", nativeLabel: "Bahasa Indonesia", direction: "ltr", fallbackLocale: "en", enabled: true },
  pt: { code: "pt", label: "Português", nativeLabel: "Português", direction: "ltr", fallbackLocale: "en", enabled: true },
  es: { code: "es", label: "Español", nativeLabel: "Español", direction: "ltr", fallbackLocale: "en", enabled: true },
  de: { code: "de", label: "Deutsch", nativeLabel: "Deutsch", direction: "ltr", fallbackLocale: "en", enabled: true },
  // Promoted with the Minbar handoff — `Component.BODY_TRANSLATED` lists all 19
  // as body-translated, and `Minbar/i18n/<lang>/` ships complete bundles.
  ur: { code: "ur", label: "Urdu", nativeLabel: "اردو", direction: "rtl", fallbackLocale: "en", enabled: true },
  sq: { code: "sq", label: "Albanian", nativeLabel: "Shqip", direction: "ltr", fallbackLocale: "en", enabled: true },
  it: { code: "it", label: "Italian", nativeLabel: "Italiano", direction: "ltr", fallbackLocale: "en", enabled: true },
  nl: { code: "nl", label: "Dutch", nativeLabel: "Nederlands", direction: "ltr", fallbackLocale: "en", enabled: true },
  sv: { code: "sv", label: "Swedish", nativeLabel: "Svenska", direction: "ltr", fallbackLocale: "en", enabled: true },
  no: { code: "no", label: "Norwegian", nativeLabel: "Norsk", direction: "ltr", fallbackLocale: "en", enabled: true },
  da: { code: "da", label: "Danish", nativeLabel: "Dansk", direction: "ltr", fallbackLocale: "en", enabled: true },
  ms: { code: "ms", label: "Malay", nativeLabel: "Bahasa Melayu", direction: "ltr", fallbackLocale: "en", enabled: true },
  ja: { code: "ja", label: "Japanese", nativeLabel: "日本語", direction: "ltr", fallbackLocale: "en", enabled: true },
  zh: { code: "zh", label: "Chinese", nativeLabel: "中文", direction: "ltr", fallbackLocale: "en", enabled: true },
  hi: { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", direction: "ltr", fallbackLocale: "en", enabled: true },
};

/** Historical export — label map for the enabled locales. Unchanged values. */
export const LOCALE_LABELS: Record<SupportedLocale, string> = SUPPORTED_LOCALES.reduce(
  (acc, code) => {
    acc[code] = LOCALES[code].label;
    return acc;
  },
  {} as Record<SupportedLocale, string>
);

/** Enabled locales for dropdown/select (code + label). */
export const LOCALE_OPTIONS = SUPPORTED_LOCALES.map((code) => ({
  code,
  label: LOCALE_LABELS[code],
}));

/** Every registered locale for admin/messaging pickers (code + label + enabled). */
export const ALL_LOCALE_OPTIONS = ALL_LOCALES.map((code) => ({
  code,
  label: LOCALES[code].label,
  nativeLabel: LOCALES[code].nativeLabel,
  enabled: LOCALES[code].enabled,
}));

export const DEFAULT_LOCALE: SupportedLocale = "ar";

/** True for enabled / publicly-routed locales (unchanged historical semantics). */
export function isValidLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** True for any registered locale, including future/disabled ones. */
export function isKnownLocale(value: string): value is AnyLocale {
  return (ALL_LOCALES as readonly string[]).includes(value);
}

/** Text direction for a locale. Unknown input defaults to `ltr`. */
export function localeDirection(value: string): LocaleDirection {
  return isKnownLocale(value) ? LOCALES[value].direction : "ltr";
}

/** Metadata for a locale, or `undefined` if not registered. */
export function localeMeta(value: string): LocaleMeta | undefined {
  return isKnownLocale(value) ? LOCALES[value] : undefined;
}
