"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Film, Plus, Pencil } from "lucide-react";
import { dt } from "@/lib/dashboard/i18n";
import { describeVideoSource } from "@/lib/content/video-platform";
type Item = { id: string; title: string; isActive: boolean; url?: string; youtubeId?: string; sourceUpdateId?: string | null };

export function ProjectVideoLibrary({ campaignId, disabled, refreshKey }: { campaignId: string; disabled: boolean; refreshKey?: string }) {
  const [items, setItems] = useState<Item[]>([]), [error, setError] = useState("");
  useEffect(() => {
    if (campaignId === "new") return;
    const controller = new AbortController();
    fetch(`/api/videos/admin?campaignId=${encodeURIComponent(campaignId)}&type=ACHIEVEMENT`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(dt("تعذر تحميل فيديوهات المشروع"));
      const data = await response.json(); setItems(data.items || []);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [campaignId, refreshKey]);
  return <section className="space-y-4 rounded-xl border bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold"><Film size={20} />{dt("فيديوهات إنجازات المشروع")}</h3><Link aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} className={`inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm text-white ${disabled ? "pointer-events-none opacity-50" : ""}`} href={`/dashboard/content/videos/new?campaignId=${campaignId}`}><Plus size={16} />{dt("إضافة فيديو إنجاز")}</Link></div>
    <p className="text-xs leading-6 text-slate-500">{dt("الفيديو المرتبط بهذا المشروع يظهر في إنجازاتنا وفي صفحة المشروع. التعديل يتم من مكتبة واحدة.")}</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <div className="grid gap-3 sm:grid-cols-2">{items.map(item => <article key={item.id} className="flex items-center gap-3 rounded-lg border p-3"><Film size={24} className="shrink-0 text-brand" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="text-xs text-slate-500">{describeVideoSource(item).providerLabel} · {item.isActive ? dt("منشور") : dt("غير منشور")}</p>{item.sourceUpdateId ? <Link href={`/dashboard/communication/campaigns/new?updateId=${item.sourceUpdateId}`} className="text-xs text-brand underline">{dt("إرسال للمتبرعين")}</Link> : null}</div><Link aria-label={dt("تعديل") + ": " + item.title} aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} className={disabled ? "pointer-events-none opacity-50" : "p-2"} href={`/dashboard/content/videos/${item.id}`}><Pencil size={16} /></Link></article>)}</div>}
    {!items.length && !error ? <p className="text-sm text-slate-500">{dt("لا توجد فيديوهات مرتبطة بهذا المشروع بعد.")}</p> : null}
  </section>;
}
