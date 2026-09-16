"use client";

import { useEffect, useRef } from "react";

/**
 * One burst of confetti in the site's own palette, drawn on a canvas that
 * covers the viewport and is removed when the last piece has fallen.
 *
 * Restrained on purpose: a hundred-odd pieces, gold and red and ivory with a
 * little navy, falling for about three seconds and never repeating. A page
 * that says "may Allah accept it" should feel like a quiet celebration, not a
 * casino. Nothing runs at all for a visitor who prefers reduced motion.
 *
 * No library: the whole thing is a few dozen lines, and pulling a confetti
 * package in for the one page that uses it is not worth the kilobytes.
 */

const COLOURS = ["#D39A27", "#F1C766", "#A93428", "#FFFDF8", "#10212B", "#E8D7A8"];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  colour: string;
  /** Ribbons are long and thin; the rest are squares. */
  ribbon: boolean;
  drift: number;
}

export default function Confetti({ pieces = 140, duration = 3200 }: { pieces?: number; duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    /* Two fountains from the lower corners meeting over the message, rather
       than a rain from the top edge — it reads as a burst for this moment. */
    const W = window.innerWidth;
    const H = window.innerHeight;
    const items: Piece[] = Array.from({ length: pieces }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -Math.PI / 2 + 0.55 : -Math.PI / 2 - 0.55) + (Math.random() - 0.5) * 0.9;
      const speed = 9 + Math.random() * 9;
      const ribbon = Math.random() < 0.3;
      return {
        x: fromLeft ? W * 0.12 : W * 0.88,
        y: H * 0.78,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: ribbon ? 4 : 7 + Math.random() * 5,
        h: ribbon ? 14 + Math.random() * 8 : 7 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        ribbon,
        drift: (Math.random() - 0.5) * 0.06,
      };
    });

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      const fade = t > duration - 700 ? Math.max(0, (duration - t) / 700) : 1;
      let alive = false;
      for (const p of items) {
        p.vy += 0.32; // gravity
        p.vx *= 0.985; // air
        p.vx += Math.sin(t / 300 + p.rot) * p.drift;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < H + 40) alive = true;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive && t < duration) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [pieces, duration]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60 }}
    />
  );
}
