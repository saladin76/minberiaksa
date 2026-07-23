"use client";

import { useMemo, useRef, useState } from "react";
import { languages } from "@/config/languages";
import { GlobeIcon } from "@/components/ui/icons";
import { SelectTrigger } from "@/components/ui/select-trigger";
import { SelectorSheet } from "./selector-sheet";

export function LanguageSelectorSheet({ compact = false }: { compact?: boolean }) {
  const [selectedCode, setSelectedCode] = useState("ar");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = languages.find((language) => language.code === selectedCode) ?? languages[0];
  const options = useMemo(() => languages.map((language) => ({
    id: language.code,
    primary: language.nativeLabel,
    secondary: language.label,
    badge: language.direction === "rtl" ? "RTL" : undefined,
    direction: language.direction,
    lang: language.code,
  })), []);

  return (
    <div className={["selector", compact ? "selector--compact" : ""].filter(Boolean).join(" ")}>
      <SelectTrigger ref={triggerRef} aria-label={`اختيار اللغة، الحالية ${selected.nativeLabel}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="selector-trigger-content"><GlobeIcon width={18} height={18} /><span>{compact ? selected.code.toUpperCase() : selected.nativeLabel}</span></span>
      </SelectTrigger>
      <SelectorSheet
        open={open}
        title="اختر اللغة"
        searchLabel="ابحث باسم اللغة"
        emptyLabel="لا توجد لغة مطابقة."
        selectedId={selectedCode}
        options={options}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        onSelect={(code) => { setSelectedCode(code); setOpen(false); }}
        notice={selected.translated ? "النسخة العربية الحالية." : "الترجمة الكاملة لهذه اللغة قيد الإعداد."}
      />
    </div>
  );
}
