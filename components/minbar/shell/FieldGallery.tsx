"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { routeForPathname } from "@/lib/minbar/routes";
import { galleryCaption, galleryHiddenOn, galleryTexts, galleryVariant, type PublicGalleryImage } from "@/lib/site-gallery/shared";

/** "Moments from the field": one row of square photos that slides sideways, above the footer of the home page and
    of each project page only (owner, 2026-11-21: it used to appear on every page), with a full-size viewer. */
export default function FieldGallery({ locale }: { locale: string }) {
  const pathname = usePathname() ?? "";
  const rtl = locale.startsWith("ar");
  const route = routeForPathname(pathname);
  const hidden = galleryHiddenOn(pathname) || (route !== "home" && route !== "projectDetail");
  const row = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const slide = (dir: 1 | -1) => { const el = row.current; if (el) el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: "smooth" }); };
  const [images, setImages] = useState<PublicGalleryImage[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const t = galleryTexts(locale);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 14px" }}>
        <h2 id="field-gallery-title" style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--deep, #0f2a3d)" }}>{t.title}</h2>
        {images.length > 2 && (
          <div className="fg-arrows" style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => slide(-1)} aria-label={t.previous} style={arrowBtn}>{rtl ? "›" : "‹"}</button>
            <button type="button" onClick={() => slide(1)} aria-label={t.next} style={arrowBtn}>{rtl ? "‹" : "›"}</button>
          </div>
        )}
      </div>
      <div ref={row} className="fg-row" style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {images.map((img, i) => {
          const caption = galleryCaption(img.captions, locale);
          return (
            <button key={img.id} type="button" onClick={() => setOpen(i)} aria-label={caption || t.title}
              style={{ flex: "0 0 auto", width: "clamp(140px, 40vw, 220px)", padding: 0, border: 0, borderRadius: 12, overflow: "hidden", cursor: "zoom-in", background: "#e9eef2", aspectRatio: "1 / 1", scrollSnapAlign: "start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves the sized variant */}
              <img src={galleryVariant(img.url, "thumb")} alt={caption} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          );
        })}
      </div>
      {current && (
        <div role="dialog" aria-modal="true" aria-label={t.title} onClick={() => setOpen(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(5,15,25,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <figure onClick={(e) => e.stopPropagation()} onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }} onTouchEnd={(e) => { const start = touchX.current; touchX.current = null; if (start === null || images.length < 2) return; const dx = (e.changedTouches[0]?.clientX ?? start) - start; if (Math.abs(dx) > 40) step(dx < 0 === !rtl ? 1 : -1); }} style={{ margin: 0, maxWidth: "min(1200px, 100%)", textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves the sized variant */}
            <img src={galleryVariant(current.url, "full")} alt={galleryCaption(current.captions, locale)} onClick={() => { if (images.length > 1) step(1); }} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8, cursor: images.length > 1 ? "pointer" : "default" }} />
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
const arrowBtn = { width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(15,42,61,.18)", background: "#fff", color: "var(--deep, #0f2a3d)", fontSize: 20, lineHeight: 1, cursor: "pointer" } as const;
const navBtn = { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" } as const;
