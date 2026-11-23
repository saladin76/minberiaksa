"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin gold bar at the top while the next page loads (Clarity, 22 Nov: on slow phones a tap showed a white page
 * for seconds and visitors left). It starts on a click on an internal link and finishes when the path changes.
 * Unlike a route loading.tsx it does not stream a fallback, so missing pages still answer 404 and redirects stay
 * server-side.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setState("loading");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 15000);
    };
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setState((s) => (s === "loading" ? "done" : s)), 0);
    const t2 = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pathname]);

  if (state === "idle") return null;
  return (
    <div aria-hidden="true" style={{ position: "fixed", insetInline: 0, top: 0, height: 3, zIndex: 4000, pointerEvents: "none" }}>
      <div style={{ height: "100%", background: "var(--gold, #D39A27)", boxShadow: "0 0 8px rgba(211,154,39,.6)", width: state === "done" ? "100%" : "82%", transition: state === "done" ? "width .2s ease" : "width 8s cubic-bezier(.1,.7,.2,1)", opacity: state === "done" ? 0 : 1 }} />
    </div>
  );
}
