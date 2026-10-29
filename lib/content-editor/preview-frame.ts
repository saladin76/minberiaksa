import { localeDirection } from "../locales";

import { LOCALE_FONT_STYLESHEETS } from "../locale-fonts";

export function preparePublicPreviewFrame(source: Document, target: Document, locale: string) {
  target.documentElement.className = source.documentElement.className;
  target.documentElement.lang = locale;
  target.documentElement.dir = localeDirection(locale);
  target.body.style.margin = "0";
  // Root font variables live on body, not html. CSS links alone cannot inherit
  // them across an iframe, so var(--font-poppins) previously became invalid.
  for (const name of Array.from(source.body.style)) {
    if (name.startsWith("--font-")) target.body.style.setProperty(name, source.body.style.getPropertyValue(name));
  }
  target.head.querySelectorAll("[data-preview-style]").forEach(node => node.remove());
  source.head.querySelectorAll('link[rel="stylesheet"],style').forEach(node => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.setAttribute("data-preview-style", ""); target.head.appendChild(copy);
  });
  const localeFont = LOCALE_FONT_STYLESHEETS[locale];
  if (localeFont) {
    const link = target.createElement("link"); link.rel = "stylesheet"; link.href = localeFont;
    link.setAttribute("data-preview-style", ""); target.head.appendChild(link);
  }
}
