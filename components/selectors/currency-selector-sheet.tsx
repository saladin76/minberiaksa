"use client";

import { useMemo, useRef, useState } from "react";
import { currencies } from "@/config/currencies";
import { WalletIcon } from "@/components/ui/icons";
import { SelectTrigger } from "@/components/ui/select-trigger";
import { SelectorSheet } from "./selector-sheet";

export function CurrencySelectorSheet({ compact = false }: { compact?: boolean }) {
  const [selectedCode, setSelectedCode] = useState("USD");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = currencies.find((currency) => currency.code === selectedCode) ?? currencies[0];
  const options = useMemo(() => currencies.filter((currency) => currency.enabled).map((currency) => ({ id: currency.code, primary: `${currency.code} · ${currency.symbol}`, secondary: currency.label })), []);

  return (
    <div className={["selector", compact ? "selector--compact" : ""].filter(Boolean).join(" ")}>
      <SelectTrigger ref={triggerRef} aria-label="اختيار العملة" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="selector-trigger-content"><WalletIcon width={18} height={18} /><span>{compact ? selected.code : `${selected.code} ${selected.symbol}`}</span></span>
      </SelectTrigger>
      <SelectorSheet open={open} title="اختر عملة العرض" searchLabel="ابحث بالرمز أو اسم العملة" emptyLabel="لا توجد عملة مطابقة." selectedId={selectedCode} options={options} triggerRef={triggerRef} onClose={() => setOpen(false)} onSelect={(code) => { setSelectedCode(code); setOpen(false); }} notice="تغيير العملة يغيّر طريقة العرض فقط في النموذج التجريبي. لا يوجد تحويل أسعار." />
    </div>
  );
}
