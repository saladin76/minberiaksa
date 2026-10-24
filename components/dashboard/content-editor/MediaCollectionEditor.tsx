"use client";
import type { ContentRecord } from "@/lib/content-editor/contracts";
import { describeVideoSource } from "@/lib/content/video-platform";
import { dt } from "@/lib/dashboard/i18n";
export function MediaCollectionEditor({ values, onChange, kind }: { values: ContentRecord[]; onChange: (videos: ContentRecord[]) => void; kind: "playlists" | "courses" }) {
  const update = (index: number, key: string, value: unknown) => onChange(values.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const move = (index: number, step: number) => {
    const next = [...values], target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; onChange(next);
  };
  return <section className="space-y-4 rounded-xl border bg-white p-5">
    <h3 className="font-bold">{dt("الحلقات والوحدات")}</h3>
    {values.map((row, index) => {
      const media = describeVideoSource({ url: String(row.url || row.youtubeId || "") });
      return <fieldset key={String(row.id || index)} className="space-y-3 rounded-lg border p-4">
        <legend className="px-2 text-sm">{index + 1}</legend>
        <label className="block space-y-1 text-sm"><span>{dt("العنوان")}</span><input value={String(row.title || "")} maxLength={500} onChange={(event) => update(index, "title", event.target.value)} className="w-full rounded border p-2" /></label>
        <label className="block space-y-1 text-sm"><span>{dt("رابط الفيديو (YouTube / Vimeo / MP4)")}</span><input dir="ltr" value={String(row.url || row.youtubeId || "")} onChange={(event) => update(index, "url", event.target.value)} className="w-full rounded border p-2" /></label>
        <label className="block space-y-1 text-sm"><span>{dt("الصورة المصغرة")}</span><input dir="ltr" value={String(row.thumbnail || "")} onChange={(event) => update(index, "thumbnail", event.target.value)} className="w-full rounded border p-2" /></label>
        {kind === "playlists" ? <div className="flex flex-wrap gap-4 text-sm">
          <label>{dt("المدة بالثواني")} <input type="number" min={0} value={row.durationSeconds == null ? "" : String(row.durationSeconds)} onChange={(event) => update(index, "durationSeconds", event.target.value === "" ? null : Number(event.target.value))} className="rounded border p-2" /></label>
          <label><input type="checkbox" checked={row.isActive !== false} onChange={(event) => update(index, "isActive", event.target.checked)} /> {dt("نشط")}</label>
        </div> : null}
        <div className="flex flex-wrap gap-2 text-sm">
          {media.watchUrl ? <a href={media.watchUrl} target="_blank" rel="noopener noreferrer" className="rounded border p-2">{dt("معاينة")}</a> : null}
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded border p-2">{dt("تحريك لأعلى")}</button>
          <button type="button" disabled={index === values.length - 1} onClick={() => move(index, 1)} className="rounded border p-2">{dt("تحريك لأسفل")}</button>
          <button type="button" onClick={() => onChange(values.filter((_, i) => i !== index))} className="rounded border p-2 text-red-700">{dt("إزالة من المسودة")}</button>
        </div>
      </fieldset>;
    })}
    <button type="button" className="rounded border px-4 py-2 text-sm" onClick={() => onChange([...values, { url: "", youtubeId: "", title: "", isActive: true }])}>{dt("إضافة حلقة")}</button>
  </section>;
}
