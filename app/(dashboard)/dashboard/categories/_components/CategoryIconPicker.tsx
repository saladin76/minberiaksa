"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import CategoryIcon, {
  flagIconValue,
  parseCategoryIcon,
} from "@/components/CategoryIcon";
import {
  ICON_CATALOG_WITH_FALLBACK,
  ICON_SECTOR_LABELS,
  ICON_SECTOR_ORDER,
  iconLabel,
  type IconCatalogEntry,
  type IconSector,
} from "./category-icon-catalog";

/**
 * ISO 3166-1 alpha-2 codes, so every country the flag CDN publishes can be
 * picked. Names are resolved with Intl.DisplayNames instead of being listed
 * here — the browser already ships the Arabic country names.
 */
const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AL", "AM", "AO", "AR", "AT", "AU", "AW", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BN", "BO", "BQ",
  "BR", "BS", "BT", "BW", "BY", "BZ", "CA", "CD", "CF", "CG", "CH", "CI",
  "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CY", "CZ", "DE", "DJ",
  "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "ER", "ES", "ET", "FI", "FJ",
  "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GH", "GI", "GL", "GM",
  "GN", "GP", "GQ", "GR", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT",
  "HU", "ID", "IE", "IL", "IN", "IO", "IQ", "IR", "IS", "IT", "JM", "JO",
  "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA",
  "MC", "MD", "ME", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MQ", "MR",
  "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG", "NI",
  "NL", "NO", "NP", "NR", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK",
  "PL", "PM", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU",
  "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SI", "SK", "SL", "SM", "SN",
  "SO", "SR", "SS", "ST", "SV", "SY", "SZ", "TD", "TG", "TH", "TJ", "TL",
  "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY",
  "UZ", "VA", "VC", "VE", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA",
  "ZM", "ZW",
];

/** Shown first, before the full list — where the association works most. */
const PINNED_CODES = ["PS", "SY", "TR", "SD", "YE", "SO", "LB", "AF", "SA", "EG"];

function countryNames(locale: string): Record<string, string> {
  const names: Record<string, string> = {};
  try {
    const display = new Intl.DisplayNames([locale], { type: "region" });
    for (const code of COUNTRY_CODES) {
      names[code] = display.of(code) || code;
    }
  } catch {
    for (const code of COUNTRY_CODES) names[code] = code;
  }
  return names;
}

/**
 * Picks what goes into `category.icon`: one of the built-in icons — Lucide's or
 * one of the glyphs drawn for this organisation's own project types — or any
 * country flag. Flags are stored as `flag:XX` and custom glyphs as
 * `custom:Name`; CategoryIcon also reads looser forms, so a value typed by hand
 * elsewhere still renders.
 */
export function CategoryIconPicker({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (next: string) => void;
}) {
  const parsed = parseCategoryIcon(value);
  const hasValue = Boolean(value?.trim());
  const [mode, setMode] = useState<"icon" | "flag">(
    hasValue && parsed.kind === "flag" ? "flag" : "icon",
  );
  const [query, setQuery] = useState("");
  const [iconQuery, setIconQuery] = useState("");

  // Grouped by the sectors the organisation splits its projects across, so an
  // admin adding a shelter project scans ~16 icons instead of the whole set.
  const iconGroups = useMemo(() => {
    const search = iconQuery.trim().toLowerCase();
    const matches = (entry: IconCatalogEntry) =>
      !search ||
      [entry.label, entry.name, ...(entry.keywords ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(search);

    return ICON_SECTOR_ORDER.map((sector: IconSector) => ({
      sector,
      label: ICON_SECTOR_LABELS[sector],
      entries: ICON_CATALOG_WITH_FALLBACK.filter(
        (entry) => entry.sector === sector && matches(entry),
      ),
    })).filter((group) => group.entries.length > 0);
  }, [iconQuery]);

  const iconResultCount = iconGroups.reduce((sum, group) => sum + group.entries.length, 0);

  const names = useMemo(() => countryNames("ar"), []);
  const englishNames = useMemo(() => countryNames("en"), []);

  const visibleCodes = useMemo(() => {
    const search = query.trim().toLowerCase();
    const ordered = [
      ...PINNED_CODES,
      ...COUNTRY_CODES.filter((code) => !PINNED_CODES.includes(code)),
    ];
    if (!search) return ordered;
    return ordered.filter((code) =>
      [code, names[code] || "", englishNames[code] || ""]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [query, names, englishNames]);

  const selectedCode = parsed.kind === "flag" ? parsed.countryCode : null;

  return (
    <div className="space-y-3">
      {hasValue && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <CategoryIcon name={value} className="w-5 h-5 text-brand" />
          </div>
          <span className="font-medium">
            {parsed.kind === "flag"
              ? `${names[parsed.countryCode] || parsed.countryCode} (${parsed.countryCode})`
              : iconLabel(parsed.name)}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-gray-400 hover:text-red-600 transition-colors"
            title="إزالة الأيقونة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="inline-flex rounded-lg border border-gray-200 p-1">
        {([
          { key: "icon", label: "أيقونة" },
          { key: "flag", label: "علم دولة" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMode(tab.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              mode === tab.key ? "bg-brand text-white" : "text-gray-500 hover:text-brand"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "icon" ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={iconQuery}
              onChange={(event) => setIconQuery(event.target.value)}
              placeholder="ابحث عن أيقونة (مسجد، بئر، أضحية، خيمة، يتيم...)"
              className="w-full rounded-lg border border-gray-200 py-2 ps-9 pe-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div className="max-h-80 space-y-4 overflow-y-auto pe-1">
            {iconGroups.map((group) => (
              <div key={group.sector}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  {group.label}
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {group.entries.map((entry) => {
                    const selected =
                      hasValue &&
                      (parsed.kind === "lucide" || parsed.kind === "custom") &&
                      parsed.name === entry.name;
                    return (
                      <button
                        key={entry.value}
                        type="button"
                        title={`${entry.label} (${entry.name})`}
                        onClick={() => onChange(entry.value)}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-all ${
                          selected
                            ? "border-brand bg-brand/10 text-brand"
                            : "border-gray-200 text-gray-500 hover:border-brand/50 hover:text-brand"
                        }`}
                      >
                        <CategoryIcon name={entry.value} className="w-5 h-5" />
                        <span className="w-full truncate text-center text-[9px] leading-tight">
                          {entry.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {iconResultCount === 0 && (
              <p className="py-4 text-center text-xs text-gray-400">
                لا توجد أيقونة مطابقة.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث باسم الدولة أو رمزها (TR، فلسطين، Turkey)"
              className="w-full rounded-lg border border-gray-200 py-2 ps-9 pe-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {visibleCodes.map((code) => (
              <button
                key={code}
                type="button"
                title={`${names[code] || code} (${code})`}
                onClick={() => onChange(flagIconValue(code))}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                  selectedCode === code
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-gray-200 text-gray-500 hover:border-brand/50 hover:text-brand"
                }`}
              >
                <CategoryIcon name={flagIconValue(code)} className="w-6 h-5" />
                <span className="text-[9px] leading-tight text-center truncate w-full">
                  {names[code] || code}
                </span>
              </button>
            ))}
            {visibleCodes.length === 0 && (
              <p className="col-span-full py-4 text-center text-xs text-gray-400">
                لا توجد دولة مطابقة.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CategoryIconPicker;
