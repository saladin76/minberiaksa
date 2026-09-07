"use client";

import { useEffect } from "react";
import { isKnownLocale, localeDirection } from "@/lib/locales";

/**
 * Syncs <html> dir and lang to the active locale.
 * Root layout cannot read [locale], so we set document.documentElement after mount.
 * Direction + lang come from the locale catalog (`lib/locales.ts`) so every locale
 * (including future ones) is handled without a separate hardcoded map.
 */
export default function SyncHtmlDir({ locale }: { locale: string }) {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("dir", localeDirection(locale));
    html.setAttribute("lang", isKnownLocale(locale) ? locale : "en");
  }, [locale]);
  return null;
}
