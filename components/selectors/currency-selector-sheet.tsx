"use client";

import { useMemo, useRef, useState } from "react";
import { currencies } from "@/config/currencies";
import { useCurrency } from "@/components/currency/currency-provider";
import { WalletIcon } from "@/components/ui/icons";
import { SelectTrigger } from "@/components/ui/select-trigger";
import { SelectorSheet } from "./selector-sheet";

export function CurrencySelectorSheet({ compact = false }: { compact?: boolean }) {
  const { currency, setCurrencyCode } = useCurrency();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => currencies.filter((item) => item.enabled).map((item) => ({
    id: item.code,
    primary: `${item.code} · ${item.symbol}`,
    secondary: item.label,
  })), []);

  return (
    <div className={["selector", compact ? "selector--compact" : ""].filter(Boolean).join(" ")}>
      <SelectTrigger ref={triggerRef} aria-label="اختيار العملة" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="selector-trigger-content"><WalletIcon width={18} height={18} /><span>{compact ? currency.code : `${currency.code} ${currency.symbol}`}</span></span>
      </SelectTrigger>
      <SelectorSheet
        open={open}
        title="اختر العملة"
        searchLabel="ابحث بالرمز أو اسم العملة"
        emptyLabel="لا توجد عملة مطابقة."
        selectedId={currency.code}
        options={options}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        onSelect={(code) => { setCurrencyCode(code); setOpen(false); }}
      />
    </div>
  );
}
