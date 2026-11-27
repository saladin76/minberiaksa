"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readDashboardJson } from "@/lib/dashboard/read-json";
import { dashDir, dt, dtMaybe } from "@/lib/dashboard/i18n";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";
import { GIFT_PACKAGE_ICONS, type GiftPackage, type GiftSettings } from "@/lib/minbar/gift-settings";

type Document = { settings: GiftSettings; revision: string | null; projects: { id: string; title: string }[] };
const endpoint = "/api/admin/gift-settings";
const ICON_NAMES: Record<string, string> = { water: "ماء", meal: "وجبة", basket: "سلة", book: "مصحف", waqf: "وقف", gift: "هدية", heart: "قلب" };

export default function GiftSettingsPage() {
  const [document, setDocument] = useState<Document | null>(null), [draft, setDraft] = useState<GiftSettings | null>(null);
  const [error, setError] = useState(""), [saved, setSaved] = useState(false), [saving, setSaving] = useState(false), [attempt, setAttempt] = useState(0), [search, setSearch] = useState("");
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
  const titles = useMemo(() => new Map(document?.projects.map(project => [project.id, project.title]) ?? []), [document]);
  const set = <K extends keyof GiftSettings>(key: K, value: GiftSettings[K]) => setDraft(previous => previous ? { ...previous, [key]: value } : previous);
  const move = (index: number, step: number) => setDraft(previous => {
    if (!previous || index + step < 0 || index + step >= previous.projectIds.length) return previous;
    const ids = [...previous.projectIds]; [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    return { ...previous, projectIds: ids };
  });
  const setPackage = (index: number, patch: Partial<GiftPackage>) => setDraft(previous => previous ? { ...previous, packages: previous.packages.map((p, i) => i === index ? { ...p, ...patch } : p) } : previous);
  function changeAmounts(text: string) {
    setAmountsText(text);
    const values = text.split(/[,،\s]+/).map(v => Number(v.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)))).filter(v => Number.isFinite(v) && v > 0);
    set("amounts", values);
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
  return <div className="mx-auto max-w-6xl space-y-5 pb-10" dir={dashDir()}>
    <header className="sticky top-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 p-4 shadow-sm">
      <div><h1 className="text-xl font-bold">{dt("إعدادات صفحة الإهداء")}</h1><p className="mt-1 text-sm text-slate-500">{dt("المبالغ والمشاريع والهدايا الجاهزة التي يختار منها المتبرع عند إهداء صدقة")}</p></div>
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
      <Card className="space-y-3 p-5"><h2 className="text-lg font-bold">{dt("المبالغ المقترحة")}</h2>
        <label className="block space-y-2 text-sm"><span>{dt("بالدولار، مفصولة بفواصل (حتى ثمانية)")}</span><input dir="ltr" className="w-full rounded-lg border p-3" value={amountsText} onChange={event => changeAmounts(event.target.value)} placeholder="25, 50, 100, 250, 500, 1000" /></label>
      </Card>
      <Card className="space-y-4 p-5"><h2 className="text-lg font-bold">{dt("مشاريع «أحدد المبلغ»")}</h2><p className="text-sm text-slate-500">{dt("يختار المتبرع منها المشروع الذي تذهب إليه هديته.")}</p>
        <div className="grid gap-5 md:grid-cols-2"><div><label className="block text-sm">{dt("البحث في المشاريع")}<input className="mt-2 w-full rounded-lg border p-3" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2">{document.projects.filter(project => project.title.toLowerCase().includes(search.toLowerCase())).map(project => <label key={project.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={draft.projectIds.includes(project.id)} onChange={event => setDraft(previous => previous ? { ...previous, projectIds: event.target.checked ? [...previous.projectIds, project.id] : previous.projectIds.filter(id => id !== project.id) } : previous)} />{project.title}</label>)}</div></div>
          <div><h3 className="mb-3 text-sm font-semibold">{dt("ترتيب المشاريع المختارة")}</h3>{!draft.projectIds.length ? <p className="rounded-lg bg-amber-50 p-3 text-sm">{dt("بدون مشاريع هنا تظهر الهدايا الجاهزة فقط")}</p> : <ol className="space-y-2">{draft.projectIds.map((id, index) => <li key={id} className="flex items-center gap-2 rounded-lg border p-3"><span className="text-xs text-slate-500">{index + 1}</span><span className="min-w-0 flex-1 break-words text-sm">{titles.get(id) || dt("مشروع لم يعد منشورًا")}</span><Button size="icon" variant="ghost" type="button" disabled={index === 0} aria-label={dt("تقديم {0}", [titles.get(id) || id])} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" type="button" disabled={index === draft.projectIds.length - 1} aria-label={dt("تأخير {0}", [titles.get(id) || id])} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" type="button" onClick={() => setDraft(previous => previous ? { ...previous, projectIds: previous.projectIds.filter(value => value !== id) } : previous)}>{dt("إزالة")}</Button></li>)}</ol>}</div></div>
      </Card>
      <Card className="space-y-4 p-5"><h2 className="text-lg font-bold">{dt("الهدايا الجاهزة")}</h2><p className="text-sm text-slate-500">{dt("هدية بقيمة ثابتة على مشروع، يظهر اسمها ووصفها من المشروع نفسه بلغة الزائر.")}</p>
        {draft.packages.map((pk, index) => <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_140px_140px_auto] md:items-end">
          <label className="block space-y-1 text-sm"><span>{dt("المشروع")}</span><select className="w-full rounded-lg border p-3" value={pk.projectId} onChange={event => setPackage(index, { projectId: event.target.value })}><option value="">{dt("اختر مشروعًا")}</option>{document.projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
          <label className="block space-y-1 text-sm"><span>{dt("السعر بالدولار")}</span><input dir="ltr" inputMode="decimal" className="w-full rounded-lg border p-3" value={pk.price || ""} onChange={event => setPackage(index, { price: Number(event.target.value.replace(/[^\d.]/g, "")) || 0 })} /></label>
          <label className="block space-y-1 text-sm"><span>{dt("الأيقونة")}</span><select className="w-full rounded-lg border p-3" value={pk.icon} onChange={event => setPackage(index, { icon: event.target.value as GiftPackage["icon"] })}>{GIFT_PACKAGE_ICONS.map(icon => <option key={icon} value={icon}>{dt(ICON_NAMES[icon] ?? icon)}</option>)}</select></label>
          <Button variant="ghost" type="button" onClick={() => setDraft(previous => previous ? { ...previous, packages: previous.packages.filter((_, i) => i !== index) } : previous)}>{dt("إزالة")}</Button>
        </div>)}
        {draft.packages.length < 10 ? <Button type="button" variant="outline" onClick={() => setDraft(previous => previous ? { ...previous, packages: [...previous.packages, { projectId: "", price: 0, icon: "gift" }] } : previous)}>{dt("إضافة هدية جاهزة")}</Button> : null}
      </Card>
    </fieldset> : null}
  </div>;
}
