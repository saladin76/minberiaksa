"use client";
import { describeVideoSource } from "@/lib/content/video-platform";
import { dt } from "@/lib/dashboard/i18n";

export function VideoSourceField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const media = describeVideoSource({ url: value });
  return <section className="space-y-3 rounded-xl border bg-white p-4">
    <label className="block space-y-2 text-sm font-semibold"><span>{dt("رابط الفيديو أو كود iframe")}</span>
      <textarea dir="ltr" rows={3} className="w-full resize-y rounded-lg border p-3 font-mono text-xs font-normal" value={value} onChange={event => onChange(event.target.value)} placeholder="https://… / <iframe src=…></iframe>" />
    </label>
    <p className="text-xs leading-6 text-slate-500">{dt("الصق رابط YouTube أو Vimeo أو Facebook أو فيديو MP4، أو كود التضمين. يُحفظ رابط المشغّل فقط.")}</p>
    {value ? media.embedUrl ? <div className="overflow-hidden rounded-lg bg-slate-950"><div className="aspect-video">{media.directVideo ? <video src={media.embedUrl} controls preload="metadata" className="h-full w-full" /> : <iframe title={dt("معاينة الفيديو")} src={media.embedUrl} loading="lazy" className="h-full w-full border-0" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}</div><p className="p-2 text-xs text-white">{media.providerLabel}</p></div>
      : <p role={media.provider === "invalid" ? "alert" : "status"} className="text-sm text-amber-700">{media.provider === "invalid" ? dt("كود التضمين أو رابط الفيديو غير مدعوم") : dt("هذا الرابط يُفتح خارجيًا؛ لا يدعم المعاينة داخل الصفحة.")}</p> : null}
  </section>;
}
