"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * In-site YouTube player.
 *
 * The handoff plays videos in an overlay rather than sending the visitor to the
 * channel — leaving the site mid-journey is the single biggest drop-off in a
 * donation flow. Ported from the `videoModal` block in
 * `Minbar/الصفحة الرئيسية.dc.html`.
 */
export function useVideoModal() {
  const [embed, setEmbed] = useState<string | null>(null);
  const open = useCallback((url: string) => setEmbed(url), []);
  const close = useCallback(() => setEmbed(null), []);
  return { embed, open, close };
}

export default function VideoModal({ embed, onClose }: { embed: string | null; onClose: () => void }) {
  const t = useTranslations("common");

  /* Escape closes, and the page behind is locked so a scroll gesture over the
     overlay does not move the article underneath it. */
  useEffect(() => {
    if (!embed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [embed, onClose]);

  if (!embed) return null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("watchVideo")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(16,33,43,.82)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // Width is capped by the viewport height as well, so a 16:9 player never
        // overflows vertically on a short window.
        style={{ position: "relative", width: "min(1400px, 100%, calc((100vh - 120px) * 16 / 9))" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="mia-video-close"
          style={{
            position: "absolute",
            insetInlineEnd: 0,
            top: -46,
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,.4)",
            background: "rgba(255,255,255,.1)",
            color: "#fff",
            fontSize: 17,
            cursor: "pointer",
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16/9",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(0,0,0,.5)",
          }}
        >
          <iframe
            src={embed}
            title={t("watchVideo")}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
