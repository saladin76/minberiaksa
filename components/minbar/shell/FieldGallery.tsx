"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { galleryCaption, galleryHiddenOn, galleryTexts, galleryVariant, type PublicGalleryImage } from "@/lib/site-gallery/shared";

/** "Moments from the field": visible gallery images above the footer, with a full-size viewer. */
export default function FieldGallery({ locale }: { locale: string }) {
  const pathname = usePathname() ?? "";
  const hidden = galleryHiddenOn(pathname);
  const [images, setImages] = useState<PublicGalleryImage[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const t = galleryTexts(locale);
  const rtl = locale.startsWith("ar");

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    fetch("/api/site-gallery").then((r) => (r.ok ? r.json() : { images: [] }))
      .then((d: { images?: PublicGalleryImage[] }) => { if (alive) setImages(Array.isArray(d.images) ? d.images : []); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [hidden]);

  const step = useCallback((delta: number) => setOpen((i) => (i === null ? null : (i + delta + images.length) % images.length)), [images.length]);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") step(rtl ? -1 : 1);
      if (e.key === "ArrowLeft") step(rtl ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, rtl]);

  if (hidden || images.length === 0) return null;
  const current = open !== null ? images[open] : null;
  return (
    <section aria-labelledby="field-gallery-title" dir={rtl ? "rtl" : "ltr"} style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 16px 8px" }}>
      <h2 id="field-gallery-title" style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px", color: "var(--deep, #0f2a3d)" }}>{t.title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
        {images.map((img, i) => {
          const caption = galleryCaption(img.captions, locale);
          return (
            <button key={img.id} type="button" onClick={() => setOpen(i)} aria-label={caption || t.title}
              style={{ padding: 0, border: 0, borderRadius: 12, overflow: "hidden", cursor: "zoom-in", background: "#e9eef2", aspectRatio: "4 / 3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves the sized variant */}
              <img src={galleryVariant(img.url, "thumb")} alt={caption} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          );
        })}
      </div>
      {current && (
        <div role="dialog" aria-modal="true" aria-label={t.title} onClick={() => setOpen(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(5,15,25,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <figure onClick={(e) => e.stopPropagation()} style={{ margin: 0, maxWidth: "min(1200px, 100%)", textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves the sized variant */}
            <img src={galleryVariant(current.url, "full")} alt={galleryCaption(current.captions, locale)} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }} />
            {galleryCaption(current.captions, locale) && <figcaption style={{ color: "#fff", marginTop: 10, fontSize: 15 }}>{galleryCaption(current.captions, locale)}</figcaption>}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12 }}>
              {images.length > 1 && <button type="button" onClick={() => step(-1)} style={navBtn}>{t.previous}</button>}
              <button type="button" onClick={() => setOpen(null)} style={navBtn}>{t.close}</button>
              {images.length > 1 && <button type="button" onClick={() => step(1)} style={navBtn}>{t.next}</button>}
            </div>
          </figure>
        </div>
      )}
    </section>
  );
}
const navBtn = { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" } as const;
