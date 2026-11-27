"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readDashboardJson } from "@/lib/dashboard/read-json";
import { dashDir, dt, dtMaybe } from "@/lib/dashboard/i18n";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";
import { GIFT_PACKAGE_ICONS, type GiftIntention, type GiftSettings, type ImpactGift } from "@/lib/minbar/gift-settings";

type Document = { settings: GiftSettings; revision: string | null; projects: { id: string; title: string }[] };
const endpoint = "/api/admin/gift-settings";
const ICON_NAMES: Record<string, string> = { water: "ماء", meal: "وجبة", basket: "سلة", book: "مصحف", waqf: "وقف", gift: "هدية", heart: "قلب", orphan: "يتيم" };
const INTENTIONS: { id: GiftIntention; label: string }[] = [
  { id: "ramadan", label: "رمضان" }, { id: "eid", label: "العيد" }, { id: "baby", label: "مولود" }, { id: "wedding", label: "زواج" }, { id: "recovery", label: "بنية الشفاء" },
  { id: "success", label: "نجاح" }, { id: "hajj", label: "حج وعمرة" }, { id: "memory", label: "عن روح فقيد" }, { id: "none", label: "محبةً وتقديرًا" },
];
const emptyGift = (): ImpactGift => ({ id: "g" + Date.now().toString(36), projectId: "", icon: "gift", name: { ar: "", en: "", tr: "" }, note: { ar: "", en: "", tr: "" }, intentions: [] });

function IntentionPicker({ value, onChange }: { value: GiftIntention[]; onChange: (next: GiftIntention[]) => void }) {
  return <div className="flex flex-wrap gap-2">{INTENTIONS.map(i => { const on = value.includes(i.id); return <button key={i.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter(v => v !== i.id) : [...value, i.id])} className={on ? "rounded-full border border-amber-700 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900" : "rounded-full border px-3 py-1 text-xs text-slate-600"}>{dt(i.label)}</button>; })}</div>;
}

/** Dashboard → صفحة الإهداء: suggested values, waqf gifts, impact gifts and the open gift. */
export default function GiftSettingsPage() {
  const [document, setDocument] = useState<Document | null>(null), [draft, setDraft] = useState<GiftSettings | null>(null);
  const [error, setError] = useState(""), [saved, setSaved] = useState(false), [saving, setSaving] = useState(false), [attempt, setAttempt] = useState(0);
  const [amountsText, setAmountsText] = useState("");
  const request = useRef<AbortController | null>(null);
  const dirty = Boolean(document && draft && JSON.stringify(document.settings) !== JSON.stringify(draft));
  useDashboardUnsavedChanges(dirty);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    setDocument(null); setDraft(null); setError("");
    void readDashboardJson<Document>(endpoint, controller.signal).then(data => {
      if (!controller.signal.aborted) { setDocument(data); setDraft(structuredClone(data.settings)); setAmountsText(data.settings.amounts.join(", ")); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? dtMaybe(error.message) : dt("تعذر تحميل إعدادات صفحة الإهداء")); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 6500); return () => clearTimeout(timer); }, [saved]);
  const set = <K extends keyof GiftSettings>(key: K, value: GiftSettings[K]) => setDraft(previous => previous ? { ...previous, [key]: value } : previous);
  const setGift = (index: number, patch: Partial<ImpactGift>) => setDraft(previous => previous ? { ...previous, impactGifts: previous.impactGifts.map((g, i) => i === index ? { ...g, ...patch } : g) } : previous);
  const moveGift = (index: number, step: number) => setDraft(previous => {
    if (!previous || index + step < 0 || index + step >= previous.impactGifts.length) return previous;
    const list = [...previous.impactGifts]; [list[index], list[index + step]] = [list[index + step], list[index]];
    return { ...previous, impactGifts: list };
  });
  function changeAmounts(text: string) {
    setAmountsText(text);
    set("amounts", text.split(/[,،\s]+/).map(v => Number(v.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)))).filter(v => Number.isFinite(v) && v > 0));
  }
  function reload() {
    if (dirty && !window.confirm(dt("إعادة التحميل ستستبدل التغييرات غير المحفوظة. هل تريد المتابعة؟"))) return;
    setSaved(false); setAttempt(value => value + 1);
  }
  async function save() {
    if (!draft || !document || saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: draft, revision: document.revision }), signal: AbortSignal.any([request.current!.signal, AbortSignal.timeout(20_000)]) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.revision) throw new Error(result?.error || dt("تعذر حفظ إعدادات صفحة الإهداء"));
      const verified = await readDashboardJson<Document>(endpoint, request.current!.signal);
      if (verified.revision !== result.revision) throw new Error(dt("تغيرت الإعدادات لدى مسؤول آخر. أعد تحميلها قبل الحفظ."));
      setDocument(verified); setDraft(structuredClone(verified.settings)); setAmountsText(verified.settings.amounts.join(", ")); setSaved(true);
    } catch (error) { if (!request.current?.signal.aborted) setError(error instanceof Error ? dtMaybe(error.message) : dt("تعذر حفظ إعدادات صفحة الإهداء")); }
    finally { setSaving(false); }
  }
  const field = "w-full rounded-lg border p-3";
  return <div className="mx-auto max-w-6xl space-y-5 pb-10" dir={dashDir()}>
    <header className="sticky top-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 p-4 shadow-sm">
      <div><h1 className="text-xl font-bold">{dt("إعدادات صفحة الإهداء")}</h1><p className="mt-1 text-sm text-slate-500">{dt("القيم المقترحة وهدايا الوقف وهدايا الأثر التي يختار منها المتبرع عند الإهداء")}</p></div>
      <div className="flex flex-wrap gap-2">
        <a href="/ar/gift" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-slate-50">{dt("معاينة الصفحة")}</a>
        <Button type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}{saving ? dt("جار الحفظ…") : dt("حفظ التغييرات")}</Button>
      </div>
    </header>
    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<Button type="button" variant="outline" className="ms-3" disabled={saving} onClick={reload}>{document ? dt("إعادة تحميل الإعدادات") : dt("إعادة المحاولة")}</Button></div> : null}
    {saved && !dirty ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{dt("تم الحفظ والتحقق من النسخة المحفوظة")}</p> : null}
    {!document && !error ? <p role="status" className="p-8 text-center">{dt("جارٍ التحميل…")}</p> : null}
    {document && draft ? <fieldset disabled={saving} className="space-y-5">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{dt("حالة الصفحة")}</h2><span className={draft.enabled ? "rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800" : "rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700"}>{draft.enabled ? dt("مفعّلة") : dt("موقوفة")}</span></div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={draft.enabled} onChange={event => set("enabled", event.target.checked)} />{dt("تفعيل صفحة الإهداء للزوار")}</label>
        <p className="text-sm text-slate-500">{dt("عند الإيقاف تبقى الصفحة مخفية عن الزوار، ويراها المسؤولون فقط للمعاينة.")}</p>
      </Card>
      <Card className="space-y-3 p-5"><h2 className="text-lg font-bold">{dt("القيم المقترحة")}</h2>
        <p className="text-sm text-slate-500">{dt("تظهر في الخطوة الأولى بجانب «قيمة أخرى»، بالدولار.")}</p>
        <label className="block space-y-2 text-sm"><span>{dt("بالدولار، مفصولة بفواصل (حتى ثماني قيم)")}</span><input dir="ltr" className={field} value={amountsText} onChange={event => changeAmounts(event.target.value)} /></label>
      </Card>
      <Card className="space-y-3 p-5"><h2 className="text-lg font-bold">{dt("هدايا الوقف")}</h2>
        <p className="text-sm text-slate-500">{dt("بأسعار صفحة الوقف نفسها، ويستلم المُهدى إليه شهادة الوقف باسمه.")}</p>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={draft.waqf.share} onChange={event => set("waqf", { ...draft.waqf, share: event.target.checked })} />{dt("سهم وقفي")}</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={draft.waqf.meter} onChange={event => set("waqf", { ...draft.waqf, meter: event.target.checked })} />{dt("متر وقفي")}</label>
        <div className="space-y-2 text-sm"><span>{dt("تُقترح أولًا لهذه النيات")}</span><IntentionPicker value={draft.waqf.intentions} onChange={value => set("waqf", { ...draft.waqf, intentions: value })} /></div>
      </Card>
      <Card className="space-y-4 p-5"><h2 className="text-lg font-bold">{dt("هدايا الأثر")}</h2>
        <p className="text-sm text-slate-500">{dt("لكل هدية اسم ووصف قصير يظهران للمتبرع بلغته، ومشروع تُصرف فيه، ونيات تُقترح لها أولًا. قيمتها يختارها المتبرع من القيم المقترحة أو يكتبها.")}</p>
        {draft.impactGifts.map((g, index) => <div key={g.id} className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{g.name.ar || dt("هدية جديدة")}</b><div className="flex gap-1">
            <Button size="icon" variant="ghost" type="button" disabled={index === 0} aria-label={dt("تقديم")} onClick={() => moveGift(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" type="button" disabled={index === draft.impactGifts.length - 1} aria-label={dt("تأخير")} onClick={() => moveGift(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" type="button" aria-label={dt("إزالة")} onClick={() => setDraft(previous => previous ? { ...previous, impactGifts: previous.impactGifts.filter((_, i) => i !== index) } : previous)}><Trash2 className="h-4 w-4" /></Button>
          </div></div>
          <div className="grid gap-3 md:grid-cols-3">
            {(["ar", "en", "tr"] as const).map(lang => <label key={lang} className="block space-y-1 text-sm"><span>{dt("الاسم")} ({lang})</span><input dir={lang === "ar" ? "rtl" : "ltr"} className={field} maxLength={60} value={g.name[lang]} onChange={event => setGift(index, { name: { ...g.name, [lang]: event.target.value } })} /></label>)}
            {(["ar", "en", "tr"] as const).map(lang => <label key={"n" + lang} className="block space-y-1 text-sm"><span>{dt("الوصف")} ({lang})</span><input dir={lang === "ar" ? "rtl" : "ltr"} className={field} maxLength={120} value={g.note[lang]} onChange={event => setGift(index, { note: { ...g.note, [lang]: event.target.value } })} /></label>)}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <label className="block space-y-1 text-sm"><span>{dt("المشروع")}</span><select className={field} value={g.projectId} onChange={event => setGift(index, { projectId: event.target.value })}><option value="">{dt("اختر مشروعًا")}</option>{document.projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            <label className="block space-y-1 text-sm"><span>{dt("الأيقونة")}</span><select className={field} value={g.icon} onChange={event => setGift(index, { icon: event.target.value as ImpactGift["icon"] })}>{GIFT_PACKAGE_ICONS.map(icon => <option key={icon} value={icon}>{dt(ICON_NAMES[icon] ?? icon)}</option>)}</select></label>
          </div>
          <div className="space-y-2 text-sm"><span>{dt("تُقترح أولًا لهذه النيات")}</span><IntentionPicker value={g.intentions} onChange={value => setGift(index, { intentions: value })} /></div>
        </div>)}
        {draft.impactGifts.length < 12 ? <Button type="button" variant="outline" onClick={() => setDraft(previous => previous ? { ...previous, impactGifts: [...previous.impactGifts, emptyGift()] } : previous)}><Plus className="me-2 h-4 w-4" />{dt("إضافة هدية أثر")}</Button> : null}
      </Card>
      <Card className="space-y-3 p-5"><h2 className="text-lg font-bold">{dt("صدقة بالقيمة التي يختارها المتبرع")}</h2>
        <p className="text-sm text-slate-500">{dt("هدية أخيرة في القائمة بلا اسم مشروع ظاهر؛ اختر المشروع الذي تُصرف فيه، أو اتركها فارغة لإخفائها.")}</p>
        <select className={field} value={draft.openProjectId ?? ""} onChange={event => set("openProjectId", event.target.value || null)}><option value="">{dt("بدون (مخفية)")}</option>{document.projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
      </Card>
    </fieldset> : null}
  </div>;
}
