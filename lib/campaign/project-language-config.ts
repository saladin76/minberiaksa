export const PROJECT_LANGUAGES = [
  { locale: 'ar', labelAr: 'العربية', label: 'Arabic', countryCode: 'TR' },
  { locale: 'en', labelAr: 'الإنجليزية', label: 'English', countryCode: 'GB' },
  { locale: 'fr', labelAr: 'الفرنسية', label: 'French', countryCode: 'FR' },
  { locale: 'tr', labelAr: 'التركية', label: 'Turkish', countryCode: 'TR' },
  { locale: 'id', labelAr: 'الإندونيسية', label: 'Indonesian', countryCode: 'ID' },
  { locale: 'pt', labelAr: 'البرتغالية', label: 'Portuguese', countryCode: 'PT' },
  { locale: 'es', labelAr: 'الإسبانية', label: 'Spanish', countryCode: 'ES' },
  { locale: 'de', labelAr: 'الألمانية', label: 'German', countryCode: 'DE' },
] as const;

export type ProjectLocale = (typeof PROJECT_LANGUAGES)[number]['locale'];

export const PROJECT_LOCALES = PROJECT_LANGUAGES.map((language) => language.locale) as ProjectLocale[];

export const isProjectLocale = (value: unknown): value is ProjectLocale =>
  typeof value === 'string' && PROJECT_LOCALES.includes(value as ProjectLocale);

export const getProjectLanguage = (locale: string) =>
  PROJECT_LANGUAGES.find((language) => language.locale === locale) || PROJECT_LANGUAGES[0];
