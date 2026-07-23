import { CurrencySelectorSheet } from "@/components/selectors/currency-selector-sheet";

export function CurrencySelector({ compact = false }: { compact?: boolean }) {
  return <CurrencySelectorSheet compact={compact} />;
}
