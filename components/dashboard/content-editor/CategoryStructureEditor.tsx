"use client";
import { useState } from "react";
import { dt } from "@/lib/dashboard/i18n";
import { LOCALES, type SupportedLocale } from "@/lib/locales";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";
import type { ContentRecord, TextValues } from "@/lib/content-editor/contracts";
import { CategoryIconPicker } from "@/app/(dashboard)/dashboard/categories/_components/CategoryIconPicker";
export function CategoryStructureEditor({ settings, locale, values, onChange, onTextChange }: {
  settings: ContentRecord; locale: string; values: TextValues; onChange: (key: string, value: unknown) => void; onTextChange: (key: string, value: string) => void;
}) {
  const [iconEditor, setIconEditor] = useState("");
  const list = (key: string) => Array.isArray(settings[key]) ? settings[key] as ContentRecord[] : [];
  const setItem = (group: string, index: number, patch: ContentRecord) => onChange(group, list(group).map((item, i) => i === index ? { ...item, ...patch } : item));
  const move = (group: string, index: number, step: number) => {
    const next = [...list(group)], target = index + step; if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; onChange(group, next);
  };
  const setText = (group: string, index: number, field: string, value: string) => {
    const item = list(group)[index]; if (item.id) { onTextChange(group + "." + item.id + "." + field, value); return; }
    if (locale === "ar") setItem(group, index, { [field]: value });
    else {
      const translations = item.translations as Record<string, ContentRecord> || {};
      const keys = group === "values" ? { label: "" } : { title: "", body: "" };
      setItem(group, index, { translations: { ...translations, [locale]: { ...keys, ...translations[locale], [field]: value } } });
    }
  };
  return <div className="space-y-5">
    {(["values", "infoCards"] as const).map((group) => <section key={group} className="space-y-3 rounded-xl border bg-white p-5">
      <h3 className="font-bold">{dt(group === "values" ? dt("قيم التصنيف") : dt("البطاقات التعريفية"))}</h3>
      {list(group).map((item, index) => {
        const rowKey = String(item.id || item.draftKey || index);
        const translation: ContentRecord = locale === "ar" ? item : item.id ? {} : (item.translations as Record<string, ContentRecord> || {})[locale] || {};
        return <fieldset key={rowKey} className="space-y-3 rounded border p-4" dir={LOCALES[locale as SupportedLocale]?.direction || "rtl"}>
          <legend className="px-2 text-sm">{index + 1}</legend>
          {(group === "values" ? ["label"] : ["title", "body"]).map((field) => <label key={field} className="block space-y-1 text-sm"><span>{dt(field === "label" ? dt("النص") : field === "title" ? dt("العنوان") : dt("المحتوى"))}</span>
            <textarea maxLength={field === "body" ? 5000 : 500} value={item.id ? values[group + "." + item.id + "." + field] || "" : String(translation[field] || "")} onChange={(event) => setText(group, index, field, event.target.value)} className="w-full rounded border p-2" />
          </label>)}
          {group === "infoCards" ? <div><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setIconEditor(iconEditor === rowKey ? "" : rowKey)}>{dt("تغيير الأيقونة")}</button>{iconEditor === rowKey ? <CategoryIconPicker value={String(item.icon || "")} onChange={(icon) => setItem(group, index, { icon })} /> : null}</div> : null}
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" disabled={index === 0} onClick={() => move(group, index, -1)} className="rounded border p-2">{dt("تحريك لأعلى")}</button>
            <button type="button" disabled={index === list(group).length - 1} onClick={() => move(group, index, 1)} className="rounded border p-2">{dt("تحريك لأسفل")}</button>
            <button type="button" onClick={() => onChange(group, list(group).filter((_, i) => i !== index))} className="rounded border p-2 text-red-700">{dt("إزالة من المسودة")}</button>
          </div>
        </fieldset>;
      })}
      <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => onChange(group, [...list(group), { draftKey: crypto.randomUUID(), ...(group === "values" ? { label: "" } : { title: "", body: "", icon: "alert" }), translations: {} }])}>{dt(group === "values" ? dt("إضافة قيمة") : dt("إضافة بطاقة"))}</button>
      <p className="text-xs text-slate-500">{dt("احفظ العناصر الجديدة أولًا لتضمينها في أدوات الترجمة.")}</p>
    </section>)}
    <section className="space-y-3 rounded-xl border bg-white p-5"><h3 className="font-bold">{dt("استثناءات حسب العملة (اختياري)")}</h3>
      {list("currencyOverrides").map((row, index) => <div key={index} className="flex flex-wrap gap-2">
        <select aria-label={dt("العملة")} value={String(row.currency || "")} onChange={(event) => setItem("currencyOverrides", index, { currency: event.target.value })} className="rounded border p-2">
          <option value="">{dt("العملة")}</option>{SUPPORTED_CURRENCY_OPTIONS.filter((option) => option.code !== "USD").map((option) => <option key={option.code} value={option.code}>{option.code}</option>)}
          {row.currency && !SUPPORTED_CURRENCY_OPTIONS.some((option) => option.code === row.currency) ? <option value={String(row.currency)}>{String(row.currency)}</option> : null}
        </select>
        <input aria-label={dt("المبالغ لهذه العملة (كما تُعرض، بلا تحويل)")} dir="ltr" value={String(row.amountsStr || "")} onChange={(event) => setItem("currencyOverrides", index, { amountsStr: event.target.value })} className="min-w-40 flex-1 rounded border p-2" placeholder="50, 100, 200" />
        <button type="button" onClick={() => onChange("currencyOverrides", list("currencyOverrides").filter((_, i) => i !== index))} className="rounded border p-2 text-sm">{dt("إزالة من المسودة")}</button>
      </div>)}
      <button type="button" onClick={() => onChange("currencyOverrides", [...list("currencyOverrides"), { currency: "", amountsStr: "" }])} className="rounded border px-3 py-2 text-sm">{dt("إضافة عملة")}</button>
    </section>
  </div>;
}
