export type LanguageOption = {
  code: string;
  label: string;
  nativeLabel: string;
  direction: "rtl" | "ltr";
};

export const languages: LanguageOption[] = [
  { code: "ar", label: "Arabic", nativeLabel: "العربية", direction: "rtl" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe", direction: "ltr" },
  { code: "en", label: "English", nativeLabel: "English", direction: "ltr" },
  { code: "fr", label: "French", nativeLabel: "Français", direction: "ltr" },
  { code: "de", label: "German", nativeLabel: "Deutsch", direction: "ltr" },
  { code: "es", label: "Spanish", nativeLabel: "Español", direction: "ltr" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", direction: "ltr" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", direction: "ltr" },
];
