export const META_TEMPLATE_LANGUAGES: Record<string,string> = {
  ar:"ar",tr:"tr",en:"en_US",fr:"fr",de:"de",es:"es",id:"id",pt:"pt_BR",ur:"ur",sq:"sq",it:"it",nl:"nl",sv:"sv",no:"nb",da:"da",ms:"ms",ja:"ja",zh:"zh_CN",hi:"hi",
};
export function templateLocaleFromLanguage(value: string): string {
  const base = String(value).trim().toLowerCase().replace(/[_-].*$/, "");
  return base === "nb" ? "no" : base;
}

/** Use the language actually selected by Meta readiness, including fallback. */
export function templateLocaleHeader(template: { header?: unknown; translations?: unknown }, locale: string | null | undefined): Record<string, unknown> {
  const root = template.header && typeof template.header === "object" && !Array.isArray(template.header)
    ? template.header as Record<string, unknown> : {};
  const key = templateLocaleFromLanguage(locale ?? "ar");
  const translations = template.translations && typeof template.translations === "object"
    ? template.translations as Record<string, { header?: unknown }> : {};
  const own = key === "ar" ? null : translations[key]?.header;
  // An explicit NONE is meaningful. Never merge media from a different format/language.
  return own && typeof own === "object" && !Array.isArray(own) ? own as Record<string, unknown> : root;
}

/** A failed first submission includes Arabic on retry; published languages stay immutable. */
export function unsubmittedTemplateLocales(translations: unknown, submitted: Set<string>): string[] {
  const rows = translations && typeof translations === "object" && !Array.isArray(translations)
    ? translations as Record<string, { body?: unknown }> : {};
  return ["ar", ...Object.keys(rows).filter(key => key !== "ar" && typeof rows[key]?.body === "string" && rows[key].body.trim())]
    .filter(locale => !submitted.has(locale));
}
