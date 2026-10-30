"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readDashboardJson } from "@/lib/dashboard/read-json";
import { dashDir, dt, dtMaybe } from "@/lib/dashboard/i18n";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";
import type { RecurringPageSettings } from "@/lib/minbar/recurring-page-settings";
import { SuggestedTeamSupportSection, type SuggestedTeamSupportPayload } from "../../campaigns/_components/SuggestedTeamSupportSection";

type Document = { settings: RecurringPageSettings; revision: string | null; projects: { id: string; title: string }[] };
const endpoint = "/api/admin/recurring-page-settings";
export default function RecurringPageSettingsPage() {
  const [document, setDocument] = useState<Document | null>(null), [draft, setDraft] = useState<RecurringPageSettings | null>(null);
  const [error, setError] = useState(""), [saved, setSaved] = useState(false), [saving, setSaving] = useState(false), [attempt, setAttempt] = useState(0), [search, setSearch] = useState("");
  const request = useRef<AbortController | null>(null);
  const dirty = Boolean(document && draft && JSON.stringify(document.settings) !== JSON.stringify(draft));
  useDashboardUnsavedChanges(dirty);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    setDocument(null); setDraft(null); setError("");
    void readDashboardJson<Document>(endpoint, controller.signal).then(data => {
      if (!controller.signal.aborted) { setDocument(data); setDraft(structuredClone(data.settings)); }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? dtMaybe(error.message) : dt("تعذر تحميل إعدادات صفحة التبرع الدوري")); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 6500); return () => clearTimeout(timer); }, [saved]);
  const changeAmounts = useCallback((value: SuggestedTeamSupportPayload | null) => setDraft(previous => previous ? { ...previous, amounts: value?.amounts ?? [], byCurrency: value?.byCurrency ?? {} } : previous), []);
  const titles = useMemo(() => new Map(document?.projects.map(project => [project.id, project.title]) ?? []), [document]);
  const move = (index: number, step: number) => setDraft(previous => {
    if (!previous || index + step < 0 || index + step >= previous.projectIds.length) return previous;
    const ids = [...previous.projectIds]; [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    return { ...previous, projectIds: ids };
  });
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
      if (!response.ok || !result?.revision) throw new Error(result?.error || dt("تعذر حفظ إعدادات صفحة التبرع الدوري"));
      const verified = await readDashboardJson<Document>(endpoint, request.current!.signal);
      if (verified.revision !== result.revision) throw new Error(dt("تغيرت الإعدادات لدى مسؤول آخر. أعد تحميلها قبل الحفظ."));
      setDocument(verified); setDraft(structuredClone(verified.settings)); setSaved(true);
    } catch (error) { if (!request.current?.signal.aborted) setError(error instanceof Error ? dtMaybe(error.message) : dt("تعذر حفظ إعدادات صفحة التبرع الدوري")); }
    finally { setSaving(false); }
  }
  return <div className="mx-auto max-w-6xl space-y-5 pb-10" dir={dashDir()}>
    <header className="sticky top-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 p-4 shadow-sm">
      <div><h1 className="text-xl font-bold">{dt("إعدادات صفحة التبرع الدوري")}</h1><p className="mt-1 text-sm text-slate-500">{dt("المشاريع والمبالغ التي يختار منها الزائر عند إنشاء اشتراك جديد")}</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/dashboard/monthly">{dt("العودة إلى الاشتراكات")}</Link></Button><Button type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}{saving ? dt("جار الحفظ…") : dt("حفظ التغييرات")}</Button></div>
    </header>
    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<Button type="button" variant="outline" className="ms-3" disabled={saving} onClick={reload}>{document ? dt("إعادة تحميل الإعدادات") : dt("إعادة المحاولة")}</Button></div> : null}
    {saved && !dirty ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{dt("تم الحفظ والتحقق من النسخة المحفوظة")}</p> : null}
    {!document && !error ? <p role="status" className="p-8 text-center">{dt("جارٍ التحميل…")}</p> : null}
    {document && draft ? <fieldset disabled={saving} className="space-y-5">
      <Card className="space-y-4 p-5"><h2 className="text-lg font-bold">{dt("المبالغ المقترحة")}</h2><SuggestedTeamSupportSection key={document.revision ?? "initial"} initialConfig={document.settings} onValueChange={changeAmounts} label={dt("المبالغ الأساسية بالدولار")} helpText={dt("تظهر قيمتها بعملة الزائر. استخدم استثناء العملة لتحديد مبلغ ثابت بها.")} defaultPlaceholder="25, 50, 100, 250, 500" exceptionsLabel={dt("مبالغ ثابتة لعملات أخرى")} exceptionsEmptyHint={dt("بدون استثناءات، تستخدم المبالغ الأساسية بالدولار وما يعادلها.")} /></Card>
      <Card className="space-y-4 p-5"><h2 className="text-lg font-bold">{dt("المشاريع المعروضة")}</h2>
        <label className="block space-y-2 text-sm"><span>{dt("طريقة اختيار المشاريع")}</span><select className="w-full rounded-lg border bg-white p-3" value={draft.projectMode} onChange={event => setDraft(previous => previous ? { ...previous, projectMode: event.target.value as RecurringPageSettings["projectMode"] } : previous)}><option value="AUTO">{dt("كل المشاريع المنشورة تلقائيًا")}</option><option value="SELECTED">{dt("مشاريع محددة بترتيب تختاره")}</option></select></label>
        {draft.projectMode === "SELECTED" ? <div className="grid gap-5 md:grid-cols-2"><div><label className="block text-sm">{dt("البحث في المشاريع")}<input className="mt-2 w-full rounded-lg border p-3" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="mt-3 max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2">{document.projects.filter(project => project.title.toLowerCase().includes(search.toLowerCase())).map(project => <label key={project.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={draft.projectIds.includes(project.id)} onChange={event => setDraft(previous => previous ? { ...previous, projectIds: event.target.checked ? [...previous.projectIds, project.id] : previous.projectIds.filter(id => id !== project.id) } : previous)} />{project.title}</label>)}</div></div>
          <div><h3 className="mb-3 text-sm font-semibold">{dt("ترتيب المشاريع المختارة")}</h3>{!draft.projectIds.length ? <p className="rounded-lg bg-amber-50 p-3 text-sm">{dt("اختر مشروعًا منشورًا واحدًا على الأقل")}</p> : <ol className="space-y-2">{draft.projectIds.map((id, index) => <li key={id} className="flex items-center gap-2 rounded-lg border p-3"><span className="text-xs text-slate-500">{index + 1}</span><span className="min-w-0 flex-1 break-words text-sm">{titles.get(id) || dt("مشروع لم يعد منشورًا")}</span><Button size="icon" variant="ghost" type="button" disabled={index === 0} aria-label={dt("تقديم {0}", [titles.get(id) || id])} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" type="button" disabled={index === draft.projectIds.length - 1} aria-label={dt("تأخير {0}", [titles.get(id) || id])} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" type="button" onClick={() => setDraft(previous => previous ? { ...previous, projectIds: previous.projectIds.filter(value => value !== id) } : previous)}>{dt("إزالة")}</Button></li>)}</ol>}</div></div> : <p className="text-sm text-slate-500">{dt("أي مشروع جديد منشور يضاف تلقائيًا إلى الخيارات.")}</p>}
      </Card>
      <p className="text-sm text-slate-500">{dt("هذه الإعدادات للخطط الجديدة. تبقى الاشتراكات الحالية بمشاريعها ومبالغها ومواعيدها.")}</p>
      <Button asChild variant="outline"><Link href="/ar/recurring-donation" target="_blank" rel="noopener noreferrer">{dt("فتح الصفحة")}</Link></Button>
    </fieldset> : null}
  </div>;
}
