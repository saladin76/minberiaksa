/** One shared responsive descriptor for the first server hint and the rendered hero. */
export function heroPoster(locale: string): string {
  if (locale === "ar") return "/minbar/assets/hero/intro-ar-E_TZglHItoY.webp";
  if (locale === "tr") return "/minbar/assets/hero/intro-tr-G7mgN6jux2s.webp";
  return "/minbar/assets/hero/intro-intl-3VVMdV5c_RU.webp";
}
export function heroPosterSources(locale: string) {
  const src = heroPoster(locale);
  return { src, srcSet: `${src.replace(/\.webp$/, "-768.webp")} 768w, ${src} 1280w`, sizes: "(max-width: 900px) calc(100vw - 32px), 600px" };
}
