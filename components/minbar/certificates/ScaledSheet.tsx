"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A sheet rendered at its natural size and scaled down to fit — the preview
 * pattern of `نجاح التبرع.dc.html` (`#cert-canvas`, `.waqf-canvas`,
 * `#receipt-canvas`).
 *
 * The sheets size their type in container units with pixel minimums, so
 * simply narrowing them would clip; they are laid out at their design width
 * and shrunk with a transform. The handoff fixes the scale per breakpoint;
 * measuring the box gives the same result at every width in between.
 */
export default function ScaledSheet({
  width,
  height,
  maxWidth,
  children,
  className,
}: {
  /** Natural width of the sheet in CSS px. */
  width: number;
  /** Natural height, or `null` to measure the rendered content. */
  height: number | null;
  /** Widest the preview should be, in px. */
  maxWidth: number;
  children: ReactNode;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(maxWidth / width);
  const [measured, setMeasured] = useState<number | null>(height);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth || maxWidth;
      setScale(Math.min(available, maxWidth) / width);
      if (height == null && inner.current) setMeasured(inner.current.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [width, height, maxWidth]);

  const naturalHeight = measured ?? height ?? 0;

  return (
    <div ref={box} className={className} style={{ position: "relative", width: "100%", maxWidth, height: naturalHeight * scale, borderRadius: 8, overflow: "hidden" }}>
      <div ref={inner} style={{ position: "absolute", top: 0, left: 0, width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
