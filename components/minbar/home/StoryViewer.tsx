"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

/**
 * Full-screen story viewer, in the Instagram idiom.
 *
 * A story is a list of slides. Each image slide holds for its `durationSeconds`;
 * a video slide runs to its end. A row of progress bars shows where the viewer
 * is. Tapping the forward half advances, the other half goes back, holding
 * pauses, swiping sideways jumps a whole story, swiping down closes. When the
 * last slide of a story ends the next story starts; when the last story ends
 * the viewer closes. Arrow keys, Space and Escape do the same from a keyboard.
 *
 * "Forward" follows reading direction: in Arabic the next slide is on the LEFT,
 * because that is where the eye is going. Instagram flips the same way in RTL.
 *
 * The CTA is already an href for this visitor's locale — the API resolved it —
 * so the button is a plain link. Internal hrefs go through next/link, external
 * ones open in a new tab. Currency needs nothing here: it lives in a cookie.
 *
 * Rendered through a portal into <body> so no ancestor's transform or overflow
 * can clip it, and body scrolling is locked while it is open.
 */

export interface PublicSlide {
  id: string;
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
  durationSeconds: number;
  caption: string;
  ctaLabel: string;
  ctaHref: string | null;
}

export interface PublicStory {
  id: string;
  slug: string;
  title: string;
  image: string;
  slides: PublicSlide[];
}

export interface StoryViewerLabels {
  close: string;
  next: string;
  prev: string;
  /** Used when a slide has a CTA href but no label of its own. */
  defaultCta: string;
}

/** A press shorter than this, without movement, is a tap; longer is a hold. */
const TAP_MS = 250;
/** Horizontal travel that counts as a swipe between stories. */
const SWIPE_PX = 60;
/** Downward travel that counts as "dismiss". */
const DISMISS_PX = 90;
/** Image-slide clock resolution. Fine enough for a smooth bar, cheap enough to ignore. */
const TICK_MS = 50;

const isExternal = (href: string) => /^(?:[a-z]+:)?\/\//i.test(href);

export default function StoryViewer({
  stories,
  startIndex,
  onClose,
  onStorySeen,
  dir,
  labels,
}: {
  stories: PublicStory[];
  startIndex: number;
  onClose: () => void;
  /** Called as each story is opened, so the rail can mute its ring. */
  onStorySeen?: (storyId: string) => void;
  dir: "rtl" | "ltr";
  labels: StoryViewerLabels;
}) {
  const [storyIndex, setStoryIndex] = useState(startIndex);
  const [slideIndex, setSlideIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mounted, setMounted] = useState(false);

  const story = stories[storyIndex];
  const slide = story?.slides[slideIndex];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  /* Portal target only exists on the client. */
  useEffect(() => { setMounted(true); }, []);

  /* Lock the page behind the viewer and put focus on the close control, then
     hand both back when it goes. */
  useEffect(() => {
    const previous = document.body.style.overflow;
    const focused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      focused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (story) onStorySeen?.(story.id);
  }, [story, onStorySeen]);

  /* ── Navigation ─────────────────────────────────────────────────────── */

  const goToStory = useCallback((index: number) => {
    if (index < 0) { setSlideIndex(0); setProgress(0); return; }
    if (index >= stories.length) { onClose(); return; }
    setStoryIndex(index);
    setSlideIndex(0);
    setProgress(0);
  }, [stories.length, onClose]);

  const next = useCallback(() => {
    if (!story) return;
    if (slideIndex + 1 < story.slides.length) { setSlideIndex(slideIndex + 1); setProgress(0); }
    else goToStory(storyIndex + 1);
  }, [story, slideIndex, storyIndex, goToStory]);

  const prev = useCallback(() => {
    /* Instagram's rule: going back from the first slide, or after having
       watched a good part of this one, restarts the slide before stepping. */
    if (progress > 0.3) { setProgress(0); restartMedia(videoRef.current); return; }
    if (slideIndex > 0) { setSlideIndex(slideIndex - 1); setProgress(0); }
    else if (storyIndex > 0) {
      const target = stories[storyIndex - 1];
      setStoryIndex(storyIndex - 1);
      setSlideIndex(Math.max(0, target.slides.length - 1));
      setProgress(0);
    } else { setProgress(0); restartMedia(videoRef.current); }
  }, [progress, slideIndex, storyIndex, stories]);

  /* ── Clock for image slides ─────────────────────────────────────────── */

  useEffect(() => {
    if (!slide || slide.mediaType !== "IMAGE") return;
    const total = Math.max(1, slide.durationSeconds) * 1000;
    const id = window.setInterval(() => {
      if (paused) return;
      setProgress((p) => {
        const n = p + TICK_MS / total;
        return n >= 1 ? 1 : n;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [slide, paused]);

  /* Advance when the bar fills. Kept out of the interval so `next` is always
     the latest closure. */
  useEffect(() => {
    if (progress >= 1) next();
  }, [progress, next]);

  /* ── Video slides ───────────────────────────────────────────────────── */

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !slide || slide.mediaType !== "VIDEO") return;
    if (paused) { v.pause(); return; }
    /* The viewer opened on a tap, so sound is normally allowed. If the browser
       refuses anyway, fall back to muted rather than a frozen frame. */
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }, [slide, paused]);

  /* ── Preload the next image so the cut is instant ───────────────────── */

  useEffect(() => {
    const upcoming = story?.slides[slideIndex + 1] ?? stories[storyIndex + 1]?.slides[0];
    if (upcoming?.mediaType === "IMAGE") { const img = new Image(); img.src = upcoming.mediaUrl; }
  }, [story, stories, storyIndex, slideIndex]);

  /* ── Pointer: tap / hold / swipe ────────────────────────────────────── */

  const pointer = useRef<{ x: number; y: number; t: number; id: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    pointer.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    setPaused(true);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    setPaused(false);
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const held = performance.now() - p.t;

    if (dy > DISMISS_PX && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      /* A swipe toward the start of the reading direction goes forward. */
      const forward = dir === "rtl" ? dx > 0 : dx < 0;
      goToStory(storyIndex + (forward ? 1 : -1));
      return;
    }
    if (held < TAP_MS && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      /* The back zone is the third nearest the start of the reading direction. */
      const back = dir === "rtl" ? ratio > 2 / 3 : ratio < 1 / 3;
      if (back) prev(); else next();
    }
  };

  const onPointerCancel = () => { pointer.current = null; setPaused(false); };

  /* ── Keyboard ───────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const forwardKey = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
      const backKey = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
      if (e.key === "Escape") onClose();
      else if (e.key === forwardKey) next();
      else if (e.key === backKey) prev();
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dir, next, prev, onClose]);

  const cta = useMemo(() => {
    if (!slide?.ctaHref) return null;
    return { href: slide.ctaHref, label: slide.ctaLabel || labels.defaultCta, external: isExternal(slide.ctaHref) };
  }, [slide, labels.defaultCta]);

  if (!mounted || !story || !slide) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={story.title}
      dir={dir}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.92)", display: "grid", placeItems: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* The stage: 9:16 on wide screens, edge-to-edge on phones. */}
      <div
        style={{
          position: "relative",
          width: "min(100vw, calc(100dvh * 9 / 16))",
          height: "100dvh",
          maxHeight: "100dvh",
          background: "#000",
          overflow: "hidden",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Media. A blurred copy fills the stage behind a contained image, so a
            landscape photo is not cropped into meaninglessness. */}
        {slide.mediaType === "VIDEO" ? (
          <video
            key={slide.id}
            ref={videoRef}
            src={slide.mediaUrl}
            playsInline
            autoPlay
            preload="auto"
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(Math.min(0.999, v.currentTime / v.duration));
            }}
            onEnded={() => setProgress(1)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          />
        ) : (
          <>
            <div aria-hidden style={{ position: "absolute", inset: -40, backgroundImage: `url('${slide.mediaUrl}')`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(28px) brightness(.55)", transform: "scale(1.1)" }} />
            {/* eslint-disable-next-line @next/next/no-img-element -- CMS URLs, any host */}
            <img key={slide.id} src={slide.mediaUrl} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
          </>
        )}

        {/* Legibility scrims, top and bottom. */}
        <div aria-hidden style={{ position: "absolute", inset: "0 0 auto 0", height: 140, background: "linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,0))", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", inset: "auto 0 0 0", height: 220, background: "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.7))", pointerEvents: "none" }} />

        {/* Progress bars — one per slide of this story. */}
        <div style={{ position: "absolute", top: 10, insetInline: 10, display: "flex", gap: 4 }} aria-hidden>
          {story.slides.map((s, i) => (
            <span key={s.id} style={{ flex: 1, height: 3, borderRadius: 3, background: "rgba(255,255,255,.35)", overflow: "hidden" }}>
              <span
                style={{
                  display: "block",
                  height: "100%",
                  background: "#fff",
                  width: `${i < slideIndex ? 100 : i === slideIndex ? progress * 100 : 0}%`,
                  transition: i === slideIndex && progress > 0 ? "none" : "width .15s linear",
                }}
              />
            </span>
          ))}
        </div>

        {/* Header: ring thumbnail, title, close. */}
        <div style={{ position: "absolute", top: 22, insetInline: 12, display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
          <span aria-hidden style={{ width: 34, height: 34, borderRadius: "50%", backgroundImage: `url('${story.image}')`, backgroundSize: "cover", backgroundPosition: "center", border: "2px solid rgba(255,255,255,.9)", flex: "0 0 auto" }} />
          <span style={{ fontWeight: 800, fontSize: 14, textShadow: "0 1px 2px rgba(0,0,0,.6)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{story.title}</span>
          {paused ? <span style={{ fontSize: 11, opacity: .8 }} aria-live="polite">❚❚</span> : null}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            style={{ width: 36, height: 36, borderRadius: "50%", border: 0, background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 20, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            ×
          </button>
        </div>

        {/* Caption and CTA. */}
        <div style={{ position: "absolute", bottom: "max(20px, env(safe-area-inset-bottom))", insetInline: 16, display: "grid", gap: 12, color: "#fff", pointerEvents: "none" }}>
          {slide.caption ? (
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.6, textShadow: "0 1px 3px rgba(0,0,0,.7)", whiteSpace: "pre-line" }}>{slide.caption}</p>
          ) : null}
          {cta ? (
            cta.external ? (
              <a
                href={cta.href}
                target="_blank"
                rel="noopener noreferrer"
                style={ctaStyle}
              >
                {cta.label}
              </a>
            ) : (
              <Link href={cta.href} style={ctaStyle} onClick={onClose}>
                {cta.label}
              </Link>
            )
          ) : null}
        </div>

        {/* Visible-on-hover arrows for pointer devices; the tap zones do the
            same on touch. Screen readers get real buttons either way. */}
        <button type="button" onClick={prev} aria-label={labels.prev} style={{ ...arrowStyle, insetInlineStart: 8 }}>‹</button>
        <button type="button" onClick={next} aria-label={labels.next} style={{ ...arrowStyle, insetInlineEnd: 8 }}>›</button>
      </div>
    </div>,
    document.body
  );
}

function restartMedia(v: HTMLVideoElement | null) {
  if (v) { v.currentTime = 0; v.play().catch(() => {}); }
}

const ctaStyle: React.CSSProperties = {
  pointerEvents: "auto",
  justifySelf: "center",
  padding: "12px 28px",
  borderRadius: 999,
  background: "#fff",
  color: "#10212B",
  fontWeight: 900,
  fontSize: 14,
  textDecoration: "none",
  boxShadow: "0 6px 20px rgba(0,0,0,.35)",
};

const arrowStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: 0,
  background: "rgba(0,0,0,.35)",
  color: "#fff",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
  opacity: 0.85,
};
