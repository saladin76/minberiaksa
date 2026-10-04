"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowGlyph } from "@/components/minbar/home/TopSections";

interface ProjectHeroMediaProps {
  /** The campaign's photos, cover first. */
  images: string[];
  title: string;
  /** Overlays drawn on top of the picture (the region chip). */
  children?: ReactNode;
}

/**
 * The project hero picture. One photo is shown as it always was; with more,
 * the frame becomes a swipeable carousel that opens on the cover.
 *
 * It is a native scroll-snap track, so touch swipe, trackpads and RTL work
 * without any gesture code; the buttons and dots only scroll it.
 */
export default function ProjectHeroMedia({ images, title, children }: ProjectHeroMediaProps) {
  const t = useTranslations("common");
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const many = images.length > 1;

  /* The slide most in view is the current one  whatever moved the track. */
  useEffect(() => {
    const root = track.current;
    if (!root || !many) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    Array.from(root.children).forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [many, images.length]);

  const goTo = useCallback(
    (index: number) => {
      const root = track.current;
      if (!root) return;
      const next = (index + images.length) % images.length;
      const slide = root.children[next] as HTMLElement | undefined;
      if (!slide) return;
      /* Measured on screen, so the same sum holds in RTL and LTR. */
      const delta = slide.getBoundingClientRect().left - root.getBoundingClientRect().left;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      root.scrollBy({ left: delta, behavior: still ? "auto" : "smooth" });
    },
    [images.length],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = (event.key === "ArrowRight") !== rtl;
    goTo(active + (forward ? 1 : -1));
  };

  return (
    <div
      className="pd-hero-media"
      role={many ? "region" : undefined}
      aria-roledescription={many ? "carousel" : undefined}
      aria-label={many ? title : undefined}
      tabIndex={many ? 0 : undefined}
      onKeyDown={many ? onKeyDown : undefined}
      style={{ position: "relative", display: "block", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "var(--sand)", border: "1px solid var(--border)" }}
    >
      {many ? (
        <div ref={track} className="pd-hero-track" style={{ position: "absolute", inset: 0, display: "flex", overflowX: "auto", overflowY: "hidden", scrollSnapType: "x mandatory", overscrollBehaviorX: "contain", scrollbarWidth: "none" }}>
          {images.map((src, index) => (
            <div
              key={src}
              data-index={index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${images.length}`}
              aria-hidden={index !== active}
              style={{ position: "relative", flex: "0 0 100%", height: "100%", scrollSnapAlign: "start", scrollSnapStop: "always" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={index === 0 ? title : ""}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
                draggable={false}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", userSelect: "none" }}
              />
            </div>
          ))}
        </div>
      ) : images[0] ? (
        <span role="img" aria-label={title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${images[0]}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
      ) : null}

      <span aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(0deg, rgba(16,33,43,.6), rgba(16,33,43,0) 52%)" }} />
      {children}

      {many ? (
        <>
          <button type="button" className="pd-hero-nav" data-side="prev" aria-label={t("previous")} onClick={() => goTo(active - 1)}>
            <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
              <ArrowGlyph size={18} />
            </span>
          </button>
          <button type="button" className="pd-hero-nav" data-side="next" aria-label={t("next")} onClick={() => goTo(active + 1)}>
            <ArrowGlyph size={18} />
          </button>

          <div className="pd-hero-dots" style={{ position: "absolute", insetInline: 0, bottom: 12, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, pointerEvents: "none" }}>
            {images.map((src, index) => (
              <button
                key={src}
                type="button"
                aria-label={t("goToSlide", { n: index + 1 })}
                aria-current={index === active ? "true" : undefined}
                onClick={() => goTo(index)}
                className="pd-hero-dot"
                data-on={index === active ? "1" : "0"}
              />
            ))}
          </div>
          <span aria-live="polite" className="pd-hero-count" style={{ position: "absolute", insetInlineEnd: 14, top: 14, padding: "4px 10px", borderRadius: 999, background: "rgba(16,33,43,.72)", color: "#fff", fontSize: 12, fontWeight: 900, pointerEvents: "none" }}>
            {/* Only the figures are isolated LTR  setting `direction` on the
                badge itself would flip which side its inline-end is. */}
            <bdi dir="ltr">
              {active + 1} / {images.length}
            </bdi>
          </span>
        </>
      ) : null}
    </div>
  );
}
