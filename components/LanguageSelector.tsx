"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, Loader2 } from "lucide-react";
import ReactCountryFlag from "react-country-flag";
import { track } from "@vercel/analytics";

import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@/lib/locales";

type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Flag shown beside each language. A language is not a country, so these are a
 * best-fit convention rather than a mapping: Arabic uses SA, Urdu PK, Malay MY.
 */
const COUNTRY_CODES: Record<Locale, string> = {
  ar: "SA", en: "US", fr: "FR", tr: "TR", id: "ID", pt: "PT", es: "ES", de: "DE",
  ur: "PK", sq: "AL", it: "IT", nl: "NL", sv: "SE", no: "NO", da: "DK",
  ms: "MY", ja: "JP", zh: "CN", hi: "IN",
};

const languages: { code: Locale; name: string; countryCode: string }[] =
  SUPPORTED_LOCALES.map((code) => ({
    code,
    name: LOCALE_LABELS[code],
    countryCode: COUNTRY_CODES[code],
  }));

function fallbackLocalizedPath(pathname: string, newLocale: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  const localeInPath = SUPPORTED_LOCALES.includes(segments[0] as Locale);
  const pathWithoutLocale = localeInPath ? segments.slice(1).join("/") : segments.join("/");
  return pathWithoutLocale ? `/${newLocale}/${pathWithoutLocale}` : `/${newLocale}`;
}

async function resolveLocalizedPath(pathname: string, newLocale: Locale): Promise<string> {
  const fallback = fallbackLocalizedPath(pathname, newLocale);
  try {
    const params = new URLSearchParams({ pathname, targetLocale: newLocale });
    const res = await fetch(`/api/i18n/resolve-localized-path?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { path?: string };
    return typeof data.path === "string" && data.path.startsWith("/") ? data.path : fallback;
  } catch {
    return fallback;
  }
}

export default function LanguageSwitcher({ onDark = true }: { onDark?: boolean }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<Locale | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const currentLocale = pathname.split("/")[1] as Locale;
  const currentLang =
    languages.find((l) => l.code === currentLocale) ?? languages[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLanguageChange = async (newLocale: Locale): Promise<void> => {
    if (newLocale === currentLocale || switchingTo) {
      setOpen(false);
      return;
    }
    setSwitchingTo(newLocale);
    try { track("language_change", { from: currentLocale ?? null, to: newLocale }); } catch {}
    // Persist the explicit choice for logged-in users (best-effort, non-blocking).
    if (session?.user?.id) {
      fetch("/api/users/me/preferred-lang", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
        keepalive: true,
      }).catch(() => {});
    }
    const newPath = await resolveLocalizedPath(pathname, newLocale);
    setOpen(false);
    window.location.assign(newPath);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-sm font-medium ${
          onDark
            ? "text-white/90 hover:text-white hover:bg-white/10"
            : "text-gray-700 hover:text-[#A5243D] hover:bg-gray-100"
        }`}
      >
        <ReactCountryFlag
          svg
          alt={currentLang.name}
          countryCode={currentLang.countryCode}
          style={{ width: "1.1em", height: "1.1em" }}
        />
        <span>{currentLang.code.toUpperCase()}</span>
        {switchingTo ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-44 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
          {languages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              disabled={Boolean(switchingTo)}
              onClick={() => handleLanguageChange(lang.code)}
              className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors disabled:opacity-60
                ${
                  lang.code === currentLocale
                    ? "bg-blue-50 text-[#A5243D] font-semibold"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
            >
              {switchingTo === lang.code ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ReactCountryFlag
                  svg
                  countryCode={lang.countryCode}
                  style={{ width: "1.1em", height: "1.1em" }}
                />
              )}
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
