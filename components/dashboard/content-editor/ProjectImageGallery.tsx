"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Grip, Star, X } from "lucide-react";
import { ImageUploadField } from "@/app/(dashboard)/dashboard/_components/ImageUploadField";
import { EditorModal } from "./EditorModal";
import { dt } from "@/lib/dashboard/i18n";

export function ProjectImageGallery({ images, onChange, onUploadingChange, label }: {
  images: string[]; onChange: (images: string[]) => void; label: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const latest = useRef(images); latest.current = images;
  const drag = useRef<{ from: number; pointer: number; target: number } | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const focusIndex = useRef<number | null>(null);
  const handles = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { if (focusIndex.current !== null) { handles.current[focusIndex.current]?.focus({ preventScroll: true }); focusIndex.current = null; } }, [images]);
  const move = (from: number, to: number) => {
    const next = [...latest.current];
    if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    focusIndex.current = to;
    onChange(next);
    setAnnouncement(dt("الصورة {0}", [to + 1]) + (to === 0 ? ` · ${dt("الصورة الرئيسية")}` : ""));
  };
  return <section aria-label={label} className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{label}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs tabular-nums">{images.length}</span></div>
    <p className="text-xs leading-6 text-slate-500">{dt("الصورة الأولى رئيسية. غيّر ترتيب الصور أو أضف صورة جديدة.")}</p>
    <div role="list" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
      {images.map((url, index) => <div role="listitem" data-gallery-index={index} key={`${url}:${index}`} className={`min-w-0 overflow-hidden rounded-xl border bg-white ${target === index ? "ring-2 ring-brand" : index === 0 ? "border-brand/40 shadow-sm" : "border-slate-200"}`}>
        <div className="relative aspect-[4/3] bg-slate-100">
          <button type="button" onClick={() => setPreview(url)} className="absolute inset-0" aria-label={`${dt("معاينة")} · ${dt("الصورة {0}", [index + 1])}`}><Image unoptimized fill sizes="(max-width: 768px) 45vw, 220px" src={url} alt={dt("الصورة {0}", [index + 1])} className="object-cover" /></button>
          <span className="pointer-events-none absolute start-2 top-2 rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold shadow-sm">{index === 0 ? <span className="flex items-center gap-1 text-brand"><Star size={12} />{dt("الصورة الرئيسية")}</span> : index + 1}</span>
          <button type="button" aria-label={`${dt("إزالة")} · ${dt("الصورة {0}", [index + 1])}`} className="absolute end-2 top-2 rounded-md bg-white/95 p-1.5 text-red-700 shadow-sm" onClick={() => onChange(latest.current.filter((_, i) => i !== index))}><X size={14} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-1 p-2">
          <button type="button" ref={element => { handles.current[index] = element; }} aria-label={`${dt("ترتيب الصور")} · ${dt("الصورة {0}", [index + 1])}`} title={dt("ترتيب الصور")} className="touch-none rounded-md p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand"
            onPointerDown={event => { if (!event.isPrimary || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { from: index, pointer: event.pointerId, target: index }; setTarget(index); }}
            onPointerMove={event => { const active = drag.current; if (!active || active.pointer !== event.pointerId) return; const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-gallery-index]"); const to = Number(element?.dataset.galleryIndex); if (element && Number.isInteger(to)) { active.target = to; setTarget(to); } }}
            onPointerUp={event => { const active = drag.current; drag.current = null; setTarget(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (active) move(active.from, active.target); }}
            onPointerCancel={() => { drag.current = null; setTarget(null); }}
            onKeyDown={event => { const to = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? images.length - 1 : null; if (to !== null) { event.preventDefault(); move(index, to); } }}><Grip size={16} /></button>
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label={dt("تقديم")} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowRight size={14} /></button>
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label={dt("تأخير")} disabled={index === images.length - 1} onClick={() => move(index, index + 1)}><ArrowLeft size={14} /></button>
          {index > 0 && <button type="button" className="ms-auto rounded-md px-2 py-1.5 text-[10px] font-semibold text-brand hover:bg-brand/5" onClick={() => move(index, 0)}>{dt("اجعلها الرئيسية")}</button>}
        </div>
      </div>)}
    </div>
    <p className="sr-only" role="status">{announcement}</p>
    <ImageUploadField label={dt("إضافة صورة")} value="" onUploadingChange={onUploadingChange} onChange={url => { if (url && !latest.current.includes(url)) onChange([...latest.current, url]); }} />
    {preview && <EditorModal title={dt("معاينة الصورة")} onClose={() => setPreview(null)}><div className="relative h-[65vh]"><Image unoptimized fill sizes="90vw" src={preview} alt={dt("معاينة الصورة")} className="object-contain" /></div></EditorModal>}
  </section>;
}
