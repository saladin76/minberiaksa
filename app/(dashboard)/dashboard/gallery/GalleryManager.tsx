"use client";
import { useCallback, useEffect, useState } from "react";
import { ImageUploadField } from "../_components/ImageUploadField";
import { dt } from "@/lib/dashboard/i18n";
import { galleryEmailHtml, galleryVariant, type GalleryCaptions, type GalleryImage } from "@/lib/site-gallery/shared";

const API = "/api/admin/site-gallery";
const LOCALES = ["ar", "tr", "en", "fr"] as const;
type Filter = "ALL" | "VISIBLE" | "HIDDEN";

/** "Moments from the field": upload, show or hide on the site, caption, order, and copy links for e-mails. */
export default function GalleryManager() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [visibleOnUpload, setVisibleOnUpload] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(API, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error();
      setImages(((await r.json()) as { images: GalleryImage[] }).images);
    } catch { setError(dt("تعذر تحميل المعرض")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, query = "") => {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch(API + query, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error();
      await load();
      return true;
    } catch { setError(dt("تعذر حفظ التغيير")); return false; }
    finally { setBusy(false); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice(dt("تم النسخ")); }
    catch { window.prompt(dt("انسخ الرابط"), text); }
  };
  const move = (index: number, delta: number) => {
    const list = [...images]; const j = index + delta;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    void call("PATCH", { ids: list.map((x) => x.id) });
  };

  const shown = images.filter((i) => filter === "ALL" || (filter === "VISIBLE" ? i.visible : !i.visible));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">{dt("معرض لقطات من الميدان")}</h1>
        <p className="mt-1 text-sm text-slate-600">{dt("الصور الظاهرة تُعرض في أسفل صفحات الموقع. والصور المخفية لا تظهر في الموقع، لكن يمكن نسخ رابطها لاستخدامه في قوالب البريد.")}</p>
      </header>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-sm font-bold">{dt("رفع صورة جديدة")}</h2>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="radio" checked={visibleOnUpload} onChange={() => setVisibleOnUpload(true)} />{dt("تظهر في الموقع")}</label>
          <label className="flex items-center gap-1"><input type="radio" checked={!visibleOnUpload} onChange={() => setVisibleOnUpload(false)} />{dt("مخفية (للبريد فقط)")}</label>
        </div>
        <div className="mt-3">
          <ImageUploadField label={dt("الصورة")} value="" previewClass="w-40 h-28" onChange={(url) => { if (url) void call("POST", { url, visible: visibleOnUpload }).then((ok) => ok && setNotice(dt("أُضيفت الصورة"))); }} />
        </div>
      </section>

      <div className="flex flex-wrap gap-2 text-sm">
        {(["ALL", "VISIBLE", "HIDDEN"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 ${filter === f ? "bg-slate-800 text-white" : ""}`}>
            {f === "ALL" ? dt("الكل ({0})", [images.length]) : f === "VISIBLE" ? dt("ظاهرة ({0})", [images.filter((i) => i.visible).length]) : dt("مخفية ({0})", [images.filter((i) => !i.visible).length])}
          </button>))}
      </div>

      {shown.length === 0 ? <p className="text-sm text-slate-500">{dt("لا توجد صور بعد")}</p> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map((img) => {
          const index = images.findIndex((x) => x.id === img.id);
          return (
            <li key={img.id} className="rounded-xl border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary thumbnail */}
              <img src={galleryVariant(img.url, "thumb")} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
              <div className="mt-2 flex items-center justify-between text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={img.visible} disabled={busy} onChange={(e) => void call("PATCH", { id: img.id, visible: e.target.checked })} />
                  {img.visible ? dt("ظاهرة في الموقع") : dt("مخفية (للبريد فقط)")}
                </label>
                <span className="flex gap-1">
                  <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} className="rounded border px-2 disabled:opacity-30" aria-label={dt("تقديم")}>↑</button>
                  <button type="button" disabled={busy || index === images.length - 1} onClick={() => move(index, 1)} className="rounded border px-2 disabled:opacity-30" aria-label={dt("تأخير")}>↓</button>
                </span>
              </div>
              <CaptionEditor captions={img.captions} disabled={busy} onSave={(captions) => void call("PATCH", { id: img.id, captions }).then((ok) => ok && setNotice(dt("حُفظ الوصف")))} />
              <div className="mt-2 flex flex-wrap gap-1 text-xs">
                <button type="button" onClick={() => void copy(galleryVariant(img.url, "email"))} className="rounded border px-2 py-1">{dt("نسخ رابط للبريد")}</button>
                <button type="button" onClick={() => void copy(galleryEmailHtml(img.url, img.captions.ar ?? ""))} className="rounded border px-2 py-1">{dt("نسخ كود HTML")}</button>
                <button type="button" onClick={() => void copy(img.url)} className="rounded border px-2 py-1">{dt("نسخ الرابط الأصلي")}</button>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm(dt("حذف هذه الصورة من المعرض؟ الإيميلات التي تستخدم رابطها ستبقى تعمل."))) void call("DELETE", undefined, `?id=${img.id}`); }} className="rounded border border-red-300 px-2 py-1 text-red-700">{dt("حذف")}</button>
              </div>
            </li>);
        })}</ul>)}

      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
    </div>
  );
}

function CaptionEditor({ captions, disabled, onSave }: { captions: GalleryCaptions; disabled: boolean; onSave: (c: GalleryCaptions) => void }) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<GalleryCaptions>(captions);
  if (!open) return <button type="button" onClick={() => { setDraft(captions); setOpen(true); }} className="mt-2 text-xs text-slate-600 underline">{captions.ar || captions.tr || captions.en ? dt("تعديل الوصف") : dt("إضافة وصف (اختياري)")}</button>;
  return (
    <div className="mt-2 space-y-1">
      {LOCALES.map((l) => <input key={l} dir={l === "ar" ? "rtl" : "ltr"} className="w-full rounded border p-1 text-xs" placeholder={l.toUpperCase()} maxLength={160} value={draft[l] ?? ""} onChange={(e) => setDraft({ ...draft, [l]: e.target.value })} />)}
      <div className="flex gap-1"><button type="button" disabled={disabled} onClick={() => { onSave(draft); setOpen(false); }} className="rounded bg-slate-800 px-2 py-1 text-xs text-white">{dt("حفظ")}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border px-2 py-1 text-xs">{dt("إلغاء")}</button></div>
    </div>);
}
