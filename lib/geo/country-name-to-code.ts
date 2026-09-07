/**
 * Best-effort country NAME → ISO 3166-1 alpha-2 code. The bulk-donation import sheet stores country
 * names (e.g. "Sweden", "Tunisia") rather than codes; this maps them to the ISO2 codes used by
 * `User.countryCode` / `Donation.donorCountryCode`. Unknown names return null (the name is still
 * preserved in `User.countryName`), so nothing is fabricated.
 */

const NAME_TO_CODE: Record<string, string> = {
  afghanistan: "AF", albania: "AL", algeria: "DZ", andorra: "AD", angola: "AO", argentina: "AR",
  armenia: "AM", australia: "AU", austria: "AT", azerbaijan: "AZ", bahrain: "BH", bangladesh: "BD",
  belarus: "BY", belgium: "BE", benin: "BJ", bolivia: "BO", "bosnia and herzegovina": "BA",
  bosnia: "BA", brazil: "BR", brunei: "BN", bulgaria: "BG", "burkina faso": "BF", cambodia: "KH",
  cameroon: "CM", canada: "CA", chad: "TD", chile: "CL", china: "CN", colombia: "CO", comoros: "KM",
  "costa rica": "CR", croatia: "HR", cuba: "CU", cyprus: "CY", czechia: "CZ", "czech republic": "CZ",
  "democratic republic of the congo": "CD", denmark: "DK", djibouti: "DJ", "dominican republic": "DO",
  ecuador: "EC", egypt: "EG", "el salvador": "SV", estonia: "EE", ethiopia: "ET", finland: "FI",
  france: "FR", gabon: "GA", gambia: "GM", georgia: "GE", germany: "DE", ghana: "GH", greece: "GR",
  guinea: "GN", "hong kong": "HK", hungary: "HU", iceland: "IS", india: "IN", indonesia: "ID",
  iran: "IR", iraq: "IQ", ireland: "IE", israel: "IL", italy: "IT", "ivory coast": "CI",
  "cote d'ivoire": "CI", japan: "JP", jordan: "JO", kazakhstan: "KZ", kenya: "KE", kuwait: "KW",
  kyrgyzstan: "KG", latvia: "LV", lebanon: "LB", libya: "LY", lithuania: "LT", luxembourg: "LU",
  malaysia: "MY", maldives: "MV", mali: "ML", malta: "MT", mauritania: "MR", mexico: "MX",
  moldova: "MD", monaco: "MC", mongolia: "MN", montenegro: "ME", morocco: "MA", mozambique: "MZ",
  myanmar: "MM", nepal: "NP", netherlands: "NL", "new zealand": "NZ", niger: "NE", nigeria: "NG",
  "north macedonia": "MK", macedonia: "MK", norway: "NO", oman: "OM", pakistan: "PK", palestine: "PS",
  panama: "PA", paraguay: "PY", peru: "PE", philippines: "PH", poland: "PL", portugal: "PT",
  qatar: "QA", romania: "RO", russia: "RU", "russian federation": "RU", rwanda: "RW",
  "saudi arabia": "SA", senegal: "SN", serbia: "RS", singapore: "SG", slovakia: "SK", slovenia: "SI",
  somalia: "SO", "south africa": "ZA", "south korea": "KR", korea: "KR", spain: "ES", "sri lanka": "LK",
  sudan: "SD", sweden: "SE", switzerland: "CH", syria: "SY", taiwan: "TW", tajikistan: "TJ",
  tanzania: "TZ", thailand: "TH", tunisia: "TN", turkey: "TR", "turkiye": "TR", "türkiye": "TR",
  turkmenistan: "TM", uganda: "UG", ukraine: "UA", "united arab emirates": "AE", uae: "AE",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", "united states": "US",
  "united states of america": "US", usa: "US", us: "US", uruguay: "UY", uzbekistan: "UZ",
  venezuela: "VE", vietnam: "VN", yemen: "YE", zambia: "ZM", zimbabwe: "ZW",
};

const ISO2_SET = new Set(Object.values(NAME_TO_CODE));

/** Map a country name (or an already-ISO2 code) to ISO 3166-1 alpha-2, or null when unknown. */
export function countryNameToCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const raw = name.trim();
  if (!raw) return null;
  // Already a 2-letter ISO code?
  if (/^[A-Za-z]{2}$/.test(raw) && ISO2_SET.has(raw.toUpperCase())) return raw.toUpperCase();
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  return NAME_TO_CODE[key] ?? null;
}
