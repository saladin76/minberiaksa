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
      <div className="saved-card-options grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(card => (
          <label key={card.id} className={`saved-card-option flex min-h-16 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-[var(--gold,#D39A27)] ${value === card.id ? "border-[#a93428] bg-[#a93428]/5" : "border-slate-200 bg-white hover:border-slate-400"}`}>
            <input type="radio" name={name} value={card.id} checked={value === card.id} onChange={() => onChange(card.id)} className="size-4 shrink-0 accent-[#a93428]" />
            <CreditCard size={19} aria-hidden="true" className="shrink-0 text-[#a93428]" />
            <span className="min-w-0 flex-1">
              <span dir="ltr" className="flex flex-wrap items-center gap-x-2 text-xs font-bold"><span className="text-[10px] uppercase">{card.cardType}</span><bdi className="whitespace-nowrap tracking-wide">•••• {card.last4}</bdi></span>
              <span className="mt-0.5 block text-[11px] text-slate-500">{t("expires")} <bdi>{card.expiryDate}</bdi></span>
            </span>
          </label>
        ))}
        <label className={`saved-card-option flex min-h-16 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 focus-within:ring-2 focus-within:ring-[var(--gold,#D39A27)] ${!value ? "border-[#a93428] bg-[#a93428]/5" : "border-slate-300 bg-white hover:border-slate-400"}`}>
          <input type="radio" name={name} value="" checked={!value} onChange={() => onChange("")} className="size-4 shrink-0 accent-[#a93428]" />
          <Plus size={19} aria-hidden="true" className="shrink-0" /><span className="text-xs font-semibold">{t("useNewCard")}</span>
        </label>
      </div>
    </fieldset>
  );
}
