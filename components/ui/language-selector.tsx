import { LanguageSelectorSheet } from "@/components/selectors/language-selector-sheet";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  return <LanguageSelectorSheet compact={compact} />;
}
