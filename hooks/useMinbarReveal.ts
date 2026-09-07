"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal-on-scroll, ported from the `IntersectionObserver` block the handoff's
 * long-form pages share (`.rise` → `.rise.in`, `.kenburns` → `.kenburns.in`).
 *
 * The observer disconnects after the first intersection: these are one-way
 * entrance animations, and re-running them as the reader scrolls back up makes
 * a long report feel unstable.
 *
 * Anything that has already scrolled past — or a reader who has asked for
 * reduced motion — starts revealed, so content is never hidden behind an
 * animation that will not play.
 */
export function useMinbarReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.18) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, shown } as const;
}

/**
 * A number that counts up the first time it is seen.
 *
 * The handoff animates its headline figures from zero. These are real reported
 * totals, so the value settles on exactly the number given — never an eased
 * approximation — and a reader with reduced motion sees the final figure at
 * once rather than a number that moves under them.
 */
export function useMinbarCountUp(target: number, durationMs = 1400) {
  const { ref, shown } = useMinbarReveal<HTMLElement>(0.4);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!shown) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || durationMs <= 0) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic: fast at first, settling gently on the real figure.
      const eased = 1 - (1 - progress) ** 3;
      setValue(progress === 1 ? target : Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown, target, durationMs]);

  return { ref, value } as const;
}
