"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ComponentProps, KeyboardEvent } from "react";
import {
  defaultCountries,
  FlagImage,
  parseCountry,
  usePhoneInput,
  type PhoneInput,
} from "react-international-phone";
import "react-international-phone/style.css";

type PhoneProps = ComponentProps<typeof PhoneInput> & { locale?: string };

const labels: Record<string, { search: string; empty: string; select: string }> = {
  ar: { search: "ابحث باسم الدولة أو رمز الاتصال", empty: "لا توجد دولة مطابقة", select: "اختر رمز الاتصال" },
  tr: { search: "Ülke adı veya telefon kodu ara", empty: "Eşleşen ülke bulunamadı", select: "Telefon kodu seç" },
  fr: { search: "Rechercher un pays ou un indicatif", empty: "Aucun pays trouvé", select: "Choisir un indicatif" },
  en: { search: "Search country or calling code", empty: "No matching country", select: "Select calling code" },
};

const countries = defaultCountries.map((country) => parseCountry(country));

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
  defaultCountry = "us",
  value,
  onChange,
  forceDialCode,
  inputProps,
  inputClassName,
  className,
  required,
  disabled,
}: PhoneProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selectorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const { inputValue, country, setCountry, handlePhoneValueChange, inputRef } = usePhoneInput({
    defaultCountry,
    value,
    forceDialCode,
    onChange: ({ phone, inputValue: formatted, country: selectedCountry }) => {
      onChange?.(phone, { inputValue: formatted, country: selectedCountry });
    },
  });

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

  useEffect(() => {
    if (open && query) activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, query]);

  const toggle = () => {
    if (disabled) return;
    setQuery("");
    setActiveIndex(0);
    setOpen((current) => !current);
  };

  const selectCountry = (iso2: string) => {
    setCountry(iso2, { focusOnInput: true });
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
    <div className={`react-international-phone-input-container ${className || ""}`} dir="ltr">
      <div className="react-international-phone-country-selector searchable-phone-selector" ref={selectorRef}>
        <button
          type="button"
          className={`react-international-phone-country-selector-button ${countrySelectorStyleProps?.buttonClassName || ""}`}
          title={country.name}
          disabled={disabled}
          aria-label={copy.select}
          aria-expanded={open}
          aria-haspopup="listbox"
          data-country={country.iso2}
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
          <span className="react-international-phone-country-selector-button__button-content">
            <FlagImage iso2={country.iso2} />
            <span className="react-international-phone-country-selector-button__dropdown-arrow" />
          </span>
        </button>
        {open && (
          <div className="searchable-phone-dropdown">
            <div className="searchable-phone-search">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder={copy.search}
                aria-label={copy.search}
                aria-controls={listboxId}
                role="combobox"
                aria-expanded={open}
                aria-activedescendant={matches[activeIndex] ? `${listboxId}-${matches[activeIndex].iso2}` : undefined}
                autoComplete="off"
              />
            </div>
            <div id={listboxId} role="listbox" aria-label={copy.select} className="searchable-phone-options">
              {matches.length ? matches.map((option, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  key={option.iso2}
                  id={`${listboxId}-${option.iso2}`}
                  ref={activeIndex === index ? activeOptionRef : undefined}
                  className={`searchable-phone-option ${activeIndex === index ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectCountry(option.iso2)}
                >
                  <FlagImage iso2={option.iso2} />
                  <span className="searchable-phone-country-name">
                    {countryNames.of(option.iso2.toUpperCase()) || option.name}
                  </span>
                  <span className="searchable-phone-dial" dir="ltr">+{option.dialCode}</span>
                </button>
              )) : <p className="searchable-phone-empty">{copy.empty}</p>}
            </div>
          </div>
        )}
      </div>
      <input
        {...inputProps}
        ref={inputRef}
        type="tel"
        inputMode="tel"
        disabled={disabled ?? inputProps?.disabled}
        required={required ?? inputProps?.required}
        className={`react-international-phone-input ${inputClassName || ""}`}
        value={inputValue}
        onChange={handlePhoneValueChange}
      />
    </div>
  );
}
