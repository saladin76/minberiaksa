"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { CreditCard, Plus } from "lucide-react";

export type SavedCardOption = {
  id: string; last4: string; cardType: string; expiryDate: string;
  nickname?: string | null;
};

export function SavedCardPicker({ cards, value, onChange, disabled = false }: {
  cards: SavedCardOption[]; value: string | null; onChange: (id: string) => void; disabled?: boolean;
}) {
  const t = useTranslations("DonationDialog"), name = useId();
  if (!cards.length) return null;
  return (
    <fieldset disabled={disabled} className="min-w-0 border-0 p-0" data-clarity-mask="True" data-hj-suppress="" data-private="">
      <legend className="mb-2 text-sm font-bold">{t("savedCards")}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map(card => (
          <label key={card.id} className={`relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-[var(--gold,#D39A27)] ${value === card.id ? "border-[#a93428] bg-[#a93428]/5" : "border-slate-200 bg-white hover:border-slate-400"}`}>
            <span className="flex items-center justify-between gap-2">
              <CreditCard size={18} aria-hidden="true" className="shrink-0 text-[#a93428]" />
              <input type="radio" name={name} value={card.id} checked={value === card.id} onChange={() => onChange(card.id)} className="size-4 shrink-0 accent-[#a93428]" />
            </span>
            <span dir="ltr" className="truncate text-start text-[10px] font-bold uppercase">{card.cardType}</span>
            <bdi dir="ltr" className="whitespace-nowrap text-start text-sm font-bold tracking-wider">•••• {card.last4}</bdi>
            <span className="text-xs text-slate-500">{t("expires")} <bdi>{card.expiryDate}</bdi></span>
          </label>
        ))}
        <label className={`flex min-h-24 min-w-0 cursor-pointer flex-col justify-between gap-2 rounded-xl border border-dashed p-3 focus-within:ring-2 focus-within:ring-[var(--gold,#D39A27)] ${!value ? "border-[#a93428] bg-[#a93428]/5" : "border-slate-300 bg-white hover:border-slate-400"}`}>
          <span className="flex items-center justify-between gap-2"><Plus size={18} aria-hidden="true" /><input type="radio" name={name} value="" checked={!value} onChange={() => onChange("")} className="size-4 accent-[#a93428]" /></span>
          <span className="text-xs font-semibold">{t("useNewCard")}</span>
        </label>
      </div>
    </fieldset>
  );
}
