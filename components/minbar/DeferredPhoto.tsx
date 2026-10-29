"use client";
import { useEffect, useRef, useState } from "react";
import { imageUrl } from "@/lib/minbar/image-url";

/** Fixed media frame; offscreen images wait without moving the layout. */
export default function DeferredPhoto({ src, label, width }: { src: string; label: string; width: number }) {
  const frame = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const node = frame.current; if (!node) return;
    if (typeof IntersectionObserver === "undefined") { setReady(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setReady(true); observer.disconnect(); } }, { rootMargin: "200px" });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const photo = imageUrl(src, width), style = { position: "absolute" as const, inset: 0, width: "100%", height: "100%", objectFit: "cover" as const };
  return <span ref={frame} role="img" aria-label={label} style={{ position: "absolute", inset: 0, display: "block", overflow: "hidden" }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized first-party/delivery URL, without a second optimizer hop */}
    <img src={ready ? photo : undefined} alt="" aria-hidden="true" loading="lazy" decoding="async" fetchPriority="low" style={style}/>
    {/* eslint-disable-next-line @next/next/no-img-element -- no-script content fallback */}
    <noscript><img src={photo} alt="" aria-hidden="true" style={style}/></noscript>
  </span>;
}
