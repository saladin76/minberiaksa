"use client";

import { cn } from "@/lib/utils";
import { dt } from "@/lib/dashboard/i18n";
import type { CommunicationPurposeGroup } from "@/lib/communication/purpose-group";

type Props = {
  value: CommunicationPurposeGroup;
  onChange: (value: CommunicationPurposeGroup) => void;
};

const OPTIONS: Array<{ value: CommunicationPurposeGroup; label: string }> = [
  { value: "AUTOMATIC", label: "الرسائل التلقائية" },
  { value: "MARKETING", label: "الرسائل التسويقية" },
];

export function CommunicationPurposeTabs({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label={dt("نوع الرسائل")}
      className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-9 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4",
            value === option.value
              ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
              : "text-slate-500 hover:text-slate-800",
          )}
        >
          {dt(option.label)}
        </button>
      ))}
    </div>
  );
}
