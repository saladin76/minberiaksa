"use client";

import { useMemo, useState } from "react";
import ReactCountryFlag from "react-country-flag";
import { Check, ChevronsUpDown, Globe, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocale, useTranslations } from "next-intl";

// ISO 3166-1 alpha-2 codes for every country recognised by `Intl.DisplayNames`.
// We keep this hardcoded so the picker doesn't depend on a polyfill and stays
// stable across environments.
const COUNTRY_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
  "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ",
  "DE","DJ","DK","DM","DO","DZ",
  "EC","EE","EG","EH","ER","ES","ET",
  "FI","FJ","FK","FM","FO","FR",
  "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
  "HK","HM","HN","HR","HT","HU",
  "ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT",
  "JE","JM","JO","JP",
  "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ",
  "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
  "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ",
  "OM",
  "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY",
  "QA",
  "RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
  "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
  "UA","UG","UM","US","UY","UZ",
  "VA","VC","VE","VG","VI","VN","VU",
  "WF","WS",
  "YE","YT",
  "ZA","ZM","ZW",
] as const;

type Country = { code: string; name: string };

function buildCountryList(locale: string): Country[] {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    display = null;
  }
  return COUNTRY_CODES.map((code): Country => {
    let name: string = code;
    if (display) {
      try {
        name = display.of(code) ?? code;
      } catch {
        name = code;
      }
    }
    return { code, name };
  }).sort((a, b) => a.name.localeCompare(b.name, locale));
}

export interface CountryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCountryCode: string | null | undefined;
  saving?: boolean;
  /** Called when the user confirms — receives the selected (code, displayName). */
  onSelect: (countryCode: string, countryName: string) => Promise<void> | void;
}

export default function CountryPicker({
  open,
  onOpenChange,
  currentCountryCode,
  saving = false,
  onSelect,
}: CountryPickerProps) {
  const t = useTranslations("Profile.countryPicker");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const [query, setQuery] = useState("");

  const countries = useMemo(() => buildCountryList(locale), [locale]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countries, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={isRtl ? "rtl" : "ltr"} className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#A5243D]/10 flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-[#A5243D]" />
            </div>
            <DialogTitle>{t("title")}</DialogTitle>
          </div>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          dir={isRtl ? "rtl" : "ltr"}
          className="h-10"
        />

        <div className="flex-1 overflow-y-auto -mx-6 px-6 divide-y divide-gray-100 rounded-md border border-gray-100">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">{t("noResults")}</div>
          ) : (
            filtered.map((country) => {
              const isCurrent =
                currentCountryCode?.toUpperCase() === country.code.toUpperCase();
              return (
                <button
                  key={country.code}
                  type="button"
                  disabled={saving}
                  onClick={() => onSelect(country.code, country.name)}
                  className={`w-full flex items-center gap-3 py-2.5 px-2 text-sm transition-colors text-start ${
                    isCurrent
                      ? "bg-[#A5243D]/10 text-[#A5243D] font-semibold"
                      : "hover:bg-gray-50 text-gray-800"
                  }`}
                >
                  <ReactCountryFlag
                    countryCode={country.code}
                    svg
                    style={{ width: "1.4em", height: "1.4em" }}
                    title={country.code}
                  />
                  <span className="flex-1 truncate">{country.name}</span>
                  <span className="text-xs font-mono text-gray-400">{country.code}</span>
                  {isCurrent && (saving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#A5243D]" />
                  ) : (
                    <Check className="w-4 h-4 text-[#A5243D]" />
                  ))}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tiny inline trigger button that mirrors the EditDialog row look. */
export function CountryRow({
  countryCode,
  countryName,
  onClick,
}: {
  countryCode: string | null | undefined;
  countryName: string | null | undefined;
  onClick: () => void;
}) {
  const t = useTranslations("Profile");
  const tCp = useTranslations("Profile.countryPicker");
  const code = (countryCode ?? "").toUpperCase();
  const showFlag = /^[A-Z]{2}$/.test(code);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group text-start"
    >
      <div className="w-8 h-8 rounded-lg bg-[#A5243D]/8 flex items-center justify-center flex-shrink-0">
        <Globe className="w-4 h-4 text-[#A5243D]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-none mb-1">
          {t("account.location")}
        </p>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          {showFlag && (
            <ReactCountryFlag
              countryCode={code}
              svg
              style={{ width: "1.1em", height: "1.1em" }}
              title={code}
            />
          )}
          <span className="truncate">{countryName ?? tCp("none")}</span>
        </div>
      </div>
      <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#A5243D] flex-shrink-0 transition-colors" />
    </button>
  );
}
