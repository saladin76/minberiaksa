"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";

/**
 * Projects hero carousel — ported from `Minbar/المشاريع.dc.html`.
 *
 * Slides cross-fade rather than slide, so there is nothing to mirror in RTL; the
 * arrows do mirror, because "next" has to point forward in the reading
 * direction. Swipe is supported with both touch and pointer events, since a
 * pointer drag is how this behaves with a mouse or a pen.
 */
export interface ProjectSlide {
  title: string;
  image: string | null;
  href: string;
}

/** Under this many pixels, a drag is a click, not a swipe. */
const SWIPE_THRESHOLD = 40;

export default function ProjectsHero({ slides }: { slides: ProjectSlide[] }) {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const t = useTranslations("common");

  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);

  const count = slides.length;
  const go = useCallback(
    (delta: number) => {
      if (!count) return;
      setIndex((i) => (i + delta + count) % count);
    },
    [count]
  );

  /* Arrow keys move the carousel when it has focus — a carousel that only
     responds to a swipe is unusable from a keyboard. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") go(rtl ? -1 : 1);
    if (event.key === "ArrowLeft") go(rtl ? 1 : -1);
  };

  /* Advance on a timer, paused while the tab is hidden so a backgrounded page
     does not race through every slide. */
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => {
      if (!document.hidden) go(1);
    }, 7000);
    return () => window.clearInterval(id);
  }, [count, go]);

  const endSwipe = (x: number) => {
    if (startX.current == null) return;
    const dx = x - startX.current;
    startX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    // A drag toward the start edge means "next", whichever side that is.
    go(rtl ? (dx > 0 ? 1 : -1) : dx > 0 ? -1 : 1);
  };

  if (!count) return null;

  const arrow = (direction: "next" | "prev") => (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: (direction === "prev") === rtl ? "scaleX(-1)" : undefined }}
    >
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );

  return (
    <section style={{ position: "relative", background: "var(--deep)", borderBottom: "1px solid rgba(211,154,39,.5)", overflow: "hidden" }}>
      <div
        className="proj-hero-stage"
        role="group"
        aria-roledescription="carousel"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onTouchStart={(e) => {
          startX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => endSwipe(e.changedTouches[0].clientX)}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") startX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "touch") endSwipe(e.clientX);
        }}
        style={{ position: "relative", height: 420, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", cursor: "grab" }}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.title}
            aria-hidden={i !== index}
            style={{
              position: "absolute",
              inset: 0,
              opacity: i === index ? 1 : 0,
              pointerEvents: i === index ? "auto" : "none",
              transition: "opacity .5s ease",
            }}
          >
            {slide.image ? (
              <span
                role="img"
                aria-label={slide.title}
                style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${slide.image}')`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            ) : null}
            <span style={{ position: "absolute", inset: 0, background: "linear-gradient(-90deg, rgba(16,33,43,.94) 8%, rgba(16,33,43,.6) 56%, rgba(16,33,43,.25))", pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: 0, display: "grid", alignContent: "center" }}>
              <div style={{ maxWidth: 1240, width: "100%", margin: "0 auto", padding: "0 84px" }}>
                <div className="proj-hero-copy" style={{ display: "grid", gap: 14, justifyItems: "start", maxWidth: "60%" }}>
                  <h2 style={{ margin: 0, fontSize: "clamp(26px,3.2vw,44px)", lineHeight: 1.32, fontWeight: 900, color: "#fff" }}>{slide.title}</h2>
                </div>
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={() => go(1)} aria-label={t("next")} className="proj-arrow" style={{ ...arrowStyle, insetInlineEnd: 22 }}>
          {arrow("next")}
        </button>
        <button type="button" onClick={() => go(-1)} aria-label={t("prev")} className="proj-arrow" style={{ ...arrowStyle, insetInlineStart: 22 }}>
          {arrow("prev")}
        </button>

        <div style={{ position: "absolute", insetInline: 0, bottom: 18, zIndex: 5, display: "flex", justifyContent: "center", gap: 8 }}>
          {slides.map((slide, i) => (
            <button
              key={slide.title}
              type="button"
              onClick={() => setIndex(i)}
              data-dot={i === index ? "1" : ""}
              aria-label={t("goToSlide", { n: i + 1 })}
              aria-current={i === index}
              style={{ width: 10, height: 10, border: 0, cursor: "pointer", padding: 0, borderRadius: 999, background: "rgba(255,255,255,.45)", transition: "all .25s ease" }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const arrowStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 5,
  width: 46,
  height: 46,
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,.28)",
  background: "rgba(255,255,255,.12)",
  backdropFilter: "blur(6px)",
  color: "#fff",
  cursor: "pointer",
};
