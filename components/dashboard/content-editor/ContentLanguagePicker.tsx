"use client";
import { useState } from "react";
import { LOCALES, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { dt } from "@/lib/dashboard/i18n";

const PRIMARY: readonly SupportedLocale[] = ["ar", "tr", "en"];
export function ContentLanguagePicker({ value, onChange, disabled = false, completion }: {
  value: SupportedLocale; onChange: (locale: SupportedLocale) => void; disabled?: boolean; completion?: Partial<Record<SupportedLocale, boolean>>;
}) {
  const [search, setSearch] = useState("");
  const remaining = SUPPORTED_LOCALES.filter(code => !PRIMARY.includes(code));
  const query = search.trim().toLocaleLowerCase();
  const matches = remaining.filter(code => [code, LOCALES[code].label, LOCALES[code].nativeLabel].some(text => text.toLocaleLowerCase().includes(query)));
  const button = (code: SupportedLocale) => <button key={code} type="button" aria-pressed={value === code} aria-label={LOCALES[code].nativeLabel} disabled={disabled} onClick={() => onChange(code)} title={LOCALES[code].nativeLabel + (completion ? " · " + dt(completion[code] ? "مكتمل" : "ناقص") : "")} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${value === code ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand/40"}`}><bdi>{code.toUpperCase()}</bdi><span>{LOCALES[code].nativeLabel}</span>{completion ? <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${value === code ? "bg-white" : completion[code] ? "bg-emerald-600" : "bg-amber-500"}`} /> : null}</button>;
  return <div className="space-y-3" role="group" aria-label={dt("اختيار لغة المحتوى")}>
    <div className="flex flex-wrap gap-2">{PRIMARY.map(button)}{!PRIMARY.includes(value) ? <span aria-live="polite" className="flex min-h-11 items-center rounded-lg border border-brand bg-brand px-3 py-2 text-xs font-semibold text-white"><bdi>{value.toUpperCase()}</bdi><span className="ms-2">{LOCALES[value].nativeLabel}</span></span> : null}</div>
    <details className="rounded-xl border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{dt("لغات أخرى ({0})", [remaining.length])}</summary>
      <label className="mt-3 block text-sm">{dt("البحث عن لغة")}<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 w-full rounded-lg border p-2" maxLength={80} /></label>
      <div className="mt-3 flex flex-wrap gap-2">{matches.map(button)}</div>
      {!matches.length ? <p role="status" className="mt-3 text-sm text-slate-500">{dt("لا توجد لغة مطابقة. جرّب اسم اللغة أو رمزها.")}</p> : null}
    </details>
  </div>;
}
