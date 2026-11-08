"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, KeyboardEvent } from "react";
import {
  defaultCountries,
  FlagImage,
  parseCountry,
  PhoneInput,
  type PhoneInputRefType,
} from "react-international-phone";
import "react-international-phone/style.css";

type PhoneProps = ComponentProps<typeof PhoneInput> & { locale?: string };

const labels: Record<string, { search: string; empty: string; select: string }> = {
  ar: { search: "ابحث باسم الدولة أو رمز الاتصال", empty: "لا توجد دولة مطابقة", select: "اختر رمز الاتصال" },
  tr: { search: "Ülke adı veya telefon kodu ara", empty: "Eşleşen ülke bulunamadı", select: "Telefon kodu seç" },
  fr: { search: "Rechercher un pays ou un indicatif", empty: "Aucun pays trouvé", select: "Choisir un indicatif" },
  en: { search: "Search country or calling code", empty: "No matching country", select: "Select calling code" },
};

const countries = defaultCountries.map(parseCountry);

export function normalizeCountrySearch(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function matchesDialCodeCountry(
  country: { name: string; iso2: string; dialCode: string },
  query: string,
  localizedName?: string
): boolean {
  const needle = normalizeCountrySearch(query);
  if (!needle) return true;
  const digits = needle.replace(/[^0-9]/g, "");
  return (
    normalizeCountrySearch(country.name).includes(needle) ||
    normalizeCountrySearch(localizedName || "").includes(needle) ||
    country.iso2.toLowerCase().includes(needle) ||
    (digits.length > 0 && /^\+?[0-9\s-]+$/.test(needle) && country.dialCode.startsWith(digits))
  );
}

/**
 * Preserves react-international-phone's formatting, E.164 value, country guessing
 * and caret behavior. Only replaces the library's non-searchable country picker.
 * Selecting a result uses its public ref.setCountry method.
 */
export default function SearchablePhoneInput({
  locale = "en",
  countrySelectorStyleProps,
  ...props
}: PhoneProps) {
  const phoneRef = useRef<PhoneInputRefType>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const language = locale.split("-")[0].toLowerCase();
  const copy = labels[language] || labels.en;
  const countryNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return new Intl.DisplayNames(["en"], { type: "region" });
    }
  }, [locale]);

  const matches = useMemo(
    () => countries.filter((country) =>
      matchesDialCodeCountry(country, query, countryNames.of(country.iso2.toUpperCase()))
    ),
    [countryNames, query]
  );

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !selectorRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open]);

  const toggle = () => {
    if (props.disabled) return;
    setQuery("");
    setActiveIndex(0);
    setOpen((current) => !current);
  };

  const selectCountry = (iso2: string) => {
    phoneRef.current?.setCountry(iso2, { focusOnInput: true });
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => matches.length
        ? (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length
        : 0);
    }
    if (event.key === "Enter" && matches[activeIndex]) {
      event.preventDefault();
      selectCountry(matches[activeIndex].iso2);
    }
  };

  return (
    <PhoneInput
      {...props}
      ref={phoneRef}
      countrySelectorStyleProps={{
        ...countrySelectorStyleProps,
        renderButtonWrapper: ({ children, rootProps }) => (
          <div className="searchable-phone-selector" ref={selectorRef}>
            <button
              {...rootProps}
              type="button"
              className={`react-international-phone-country-selector-button ${countrySelectorStyleProps?.buttonClassName || ""}`}
              aria-label={copy.select}
              aria-expanded={open}
              onClick={toggle}
              onKeyDown={(event) => {
                if (event.key === "Escape" && open) setOpen(false);
                if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (!open) toggle();
                  else searchRef.current?.focus();
                }
              }}
            >
              {children}
            </button>
            {open && (
              <div className="searchable-phone-dropdown" dir="ltr">
                <div className="searchable-phone-search">
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                    onKeyDown={onSearchKeyDown}
                    placeholder={copy.search}
                    aria-label={copy.search}
                    aria-controls="searchable-phone-countries"
                    autoComplete="off"
                  />
                </div>
                <div id="searchable-phone-countries" role="listbox" aria-label={copy.select} className="searchable-phone-options">
                  {matches.length ? matches.map((country, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      key={country.iso2}
                      className={`searchable-phone-option ${activeIndex === index ? "is-active" : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectCountry(country.iso2)}
                    >
                      <FlagImage iso2={country.iso2} />
                      <span className="searchable-phone-country-name">
                        {countryNames.of(country.iso2.toUpperCase()) || country.name}
                      </span>
                      <span className="searchable-phone-dial" dir="ltr">+{country.dialCode}</span>
                    </button>
                  )) : <p className="searchable-phone-empty">{copy.empty}</p>}
                </div>
              </div>
            )}
          </div>
        ),
      }}
    />
  );
}
