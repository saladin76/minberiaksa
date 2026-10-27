"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { UpdateCard, type UpdateCardData } from "@/app/(dashboard)/dashboard/campaigns/_components/UpdateCard";
import { UpdateMediaFields } from "@/app/(dashboard)/dashboard/campaigns/_components/UpdateMediaFields";
import { AutoTranslateButton, type TranslatedLocales } from "@/app/(dashboard)/dashboard/_components/AutoTranslateButton";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";
import { dashIntl, dt } from "@/lib/dashboard/i18n";
import { LOCALES, SUPPORTED_LOCALES } from "@/lib/locales";
import { rows, text, type ContentRecord } from "@/lib/content-editor/contracts";
import { normalizeVideoSource } from "@/lib/content/video-platform";
import { safeEditorUrl } from "@/lib/content-editor/urls";
import { EditorModal } from "./EditorModal";

type Copy = { title: string; description: string };
type Draft = { id: string; image: string; videoUrl: string; values: Record<string, Copy> };
const button = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
function draftFor(row: ContentRecord = {}): Draft {
  return { id: text(row.id), image: text(row.image), videoUrl: text(row.videoUrl), values: Object.fromEntries(SUPPORTED_LOCALES.map(locale => {
    const own = locale === "ar" ? row : rows(row.translations).find(item => item.locale === locale) || {};
    return [locale, { title: text(own.title), description: text(own.description) }];
  })) };
}
function cardFor(row: ContentRecord): UpdateCardData { return { id: text(row.id), title: text(row.title), description: text(row.description), image: text(row.image), videoUrl: text(row.videoUrl), createdAt: String(row.createdAt || "") }; }
async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || dt("تعذر حفظ التحديث")); return result as ContentRecord;
}

export function CampaignUpdatesEditor({ campaignId, updates, disabled, onSaved, onUploadingChange }: {
  campaignId: string; updates: unknown; disabled: boolean; onSaved: () => Promise<void>; onUploadingChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const draftSession = useRef(0);
  const translationSession = draftSession.current;
  const [items, setItems] = useState(() => rows(updates));
  const [draft, setDraft] = useState<Draft | null>(null), [original, setOriginal] = useState("");
  const [locale, setLocale] = useState("ar"), [busy, setBusy] = useState(false), [mediaBusy, setMediaBusy] = useState(false);
  const [translated, setTranslated] = useState(false), [approved, setApproved] = useState(false), [error, setError] = useState("");
  useEffect(() => { setItems(rows(updates)); }, [updates]);
  const draftRef = useRef(draft); draftRef.current = draft;
  const dirty = Boolean(draft && JSON.stringify(draft) !== original);
  useDashboardUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: MouseEvent) => {
      if ((event.target as Element).closest?.("a[href]") && !window.confirm(dt("توجد تعديلات غير محفوظة. مغادرة المحرر؟"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.document.addEventListener("click", guard, true);
    return () => window.document.removeEventListener("click", guard, true);
  }, [dirty]);
  const uploadState = useCallback((value: boolean) => { setMediaBusy(value); onUploadingChange(value); }, [onUploadingChange]);
  const open = (row?: ContentRecord) => { draftSession.current++; const next = draftFor(row); setDraft(next); setOriginal(JSON.stringify(next)); setLocale("ar"); setError(""); setTranslated(false); setApproved(false); };
  const close = () => { if (!busy && !mediaBusy && (!dirty || window.confirm(dt("إغلاق التحديث وإلغاء تعديلاته غير المحفوظة؟")))) { draftSession.current++; setDraft(null); } };
  const edit = (key: keyof Copy, value: string) => { setDraft(previous => previous ? { ...previous, values: { ...previous.values, [locale]: { ...previous.values[locale], [key]: value } } } : null); setApproved(false); };
  const merge = (translations: TranslatedLocales, overwrite: boolean) => {
    if (translationSession !== draftSession.current || JSON.stringify(draftRef.current?.values) !== JSON.stringify(draft?.values)) {
      toast.error(dt("تغير النص أثناء الطلب؛ لم تُطبق الاقتراحات القديمة.")); return;
    }
    setDraft(previous => previous ? { ...previous, values: Object.fromEntries(Object.entries(previous.values).map(([code, value]) => [code, Object.fromEntries(Object.entries(value).map(([key, current]) => [key, (overwrite || !current.trim()) && translations[code]?.fields[key] ? translations[code].fields[key] : current])) as Copy])) } : null);
    setTranslated(true); setApproved(false);
  };
  const save = async () => {
    if (!draft || busy || mediaBusy || disabled) return;
    if (!draft.values.ar.title.trim() || !draft.values.ar.description.trim()) { setLocale("ar"); setError(dt("أكمل عنوان التحديث ومحتواه بالعربية")); return; }
    const incomplete = Object.entries(draft.values).find(([, copy]) => Boolean(copy.title.trim()) !== Boolean(copy.description.trim()));
    if (incomplete) { setLocale(incomplete[0]); setError(dt("أكمل العنوان والمحتوى لهذه اللغة أو اتركهما فارغين معًا")); return; }
    const video = draft.videoUrl ? normalizeVideoSource({ url: draft.videoUrl }) : null;
    if (video?.presentation.provider === "invalid") { setError(dt("كود التضمين أو رابط الفيديو غير مدعوم")); return; }
    if ([draft.image, video?.url].some(url => url && !safeEditorUrl(url))) { setError(dt("استخدم رابط صورة أو فيديو صالحًا")); return; }
    if (translated && !approved) { setError(dt("راجع الترجمات وأكد اعتمادها قبل الحفظ")); return; }
    setBusy(true); setError("");
    try {
      const result = await request(`/api/campaigns/${campaignId}/updates${draft.id ? "/" + draft.id : ""}`, draft.id ? "PATCH" : "POST", { ...draft.values.ar, image: draft.image, videoUrl: video?.url || "", translations: Object.fromEntries(Object.entries(draft.values).filter(([code, value]) => code !== "ar" && (value.title || value.description || items.some(item => item.id === draft.id && rows(item.translations).some(translation => translation.locale === code))))) });
      setItems(previous => draft.id ? previous.map(item => item.id === draft.id ? result : item) : [result, ...previous]);
      setDraft(null); toast.success(dt("تم حفظ التحديث وترجماته")); await onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : dt("تعذر حفظ التحديث")); }
    finally { setBusy(false); }
  };
  const remove = async (item: ContentRecord) => {
    if (disabled || busy || !window.confirm(dt("حذف هذا التحديث وترجماته؟ لا تتغير بيانات المشروع أو تبرعاته."))) return;
    setBusy(true); setError("");
    try { await request(`/api/campaigns/${campaignId}/updates/${item.id}`, "DELETE"); setItems(previous => previous.filter(row => row.id !== item.id)); toast.success(dt("تم حذف التحديث")); await onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : dt("تعذر حذف التحديث")); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 rounded-xl border bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{dt("الإنجازات والتحديثات")}</h3><button type="button" className={button + " bg-brand text-white"} disabled={disabled || busy || campaignId === "new"} onClick={() => open()}>{dt("إضافة تحديث")}</button></div>
    {disabled ? <p className="text-xs text-slate-500">{dt("احفظ تعديلات المشروع أولًا لإدارة تحديثاته دون فقدان المسودة.")}</p> : null}
    {error && !draft ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <div className="grid gap-4 md:grid-cols-2">{items.filter(item => !item.libraryVideoId).map(item => <div key={String(item.id)} inert={disabled || busy}><UpdateCard update={cardFor(item)} dateLabel={new Date(String(item.createdAt)).toLocaleDateString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul" })} onEdit={() => open(item)} onDelete={() => void remove(item)} onSend={() => router.push(`/dashboard/communication/campaigns/new?updateId=${item.id}`)} /></div>)}</div>
    {!items.filter(item => !item.libraryVideoId).length ? <p className="text-sm text-slate-500">{dt("لا توجد تحديثات منشورة لهذا المشروع.")}</p> : null}
    {draft ? <EditorModal title={dt("تحرير تحديث المشروع")} onClose={close}>
      <div className="max-h-[85vh] w-full max-w-3xl space-y-4 overflow-auto rounded-xl bg-white p-5">
        <h2 className="text-xl font-bold">{dt("تحرير تحديث المشروع")}</h2>
        <div className="flex flex-wrap gap-2"><AutoTranslateButton source={draft.values.ar} itemLabel="تحديث مشروع" onResult={merge} disabled={busy || mediaBusy} /><span className="text-xs text-slate-500">{dt("الترجمات تُراجع في المسودة ولا تُنشر قبل الحفظ.")}</span></div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={dt("لغة التحديث")}>{SUPPORTED_LOCALES.map(code => <button type="button" key={code} aria-pressed={locale === code} disabled={busy || mediaBusy} onClick={() => setLocale(code)} className={button + (locale === code ? " bg-brand text-white" : "")} title={LOCALES[code].nativeLabel}>{code.toUpperCase()}</button>)}</div>
        <div className="space-y-3"><label className="block space-y-1 text-sm"><span>{dt("العنوان")}</span><input dir={LOCALES[locale as keyof typeof LOCALES].direction} className="w-full rounded-lg border p-3" disabled={busy} value={draft.values[locale].title} onChange={event => edit("title", event.target.value)} /></label><label className="block space-y-1 text-sm"><span>{dt("المحتوى")}</span><textarea dir={LOCALES[locale as keyof typeof LOCALES].direction} className="min-h-40 w-full rounded-lg border p-3 leading-7" disabled={busy} value={draft.values[locale].description} onChange={event => edit("description", event.target.value)} /></label></div>
        <div inert={busy}><UpdateMediaFields idPrefix="workspace-update" image={draft.image} videoUrl={draft.videoUrl} onImageChange={image => setDraft(previous => previous ? { ...previous, image } : null)} onVideoChange={videoUrl => setDraft(previous => previous ? { ...previous, videoUrl } : null)} onBusyChange={uploadState} /></div>
        {translated ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} />{dt("راجعت نصوص اللغات وأعتمد حفظ الترجمات المحددة.")}</label> : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <div className="flex gap-2"><button type="button" className={button + " bg-brand text-white"} disabled={busy || mediaBusy || disabled || (translated && !approved)} onClick={save}>{busy ? dt("جار الحفظ…") : dt("حفظ التحديث وكل اللغات")}</button><button type="button" className={button} disabled={busy || mediaBusy} onClick={close}>{dt("إلغاء")}</button></div>
      </div>
    </EditorModal> : null}
  </section>;
}
