"use client";

import { useEffect } from "react";
import { whenMarketingAllowed } from "@/lib/tracking/marketing-gate";

const SRC = "https://t.contentsquare.net/uxa/e81365186c19c.js";

/**
 * Contentsquare, loaded with the other marketing scripts through the shared
 * gate (`lib/tracking/marketing-gate.ts`). It is ~150 KB and ~0.3 s of script;
 * in <head>, and later right after `load`, it ran during the page's first render.
 */
export default function DeferredContentsquare() {
  useEffect(
    () =>
      whenMarketingAllowed(() => {
        if (document.querySelector(`script[src="${SRC}"]`)) return;
        const script = document.createElement("script");
        script.async = true;
        script.src = SRC;
        document.head.appendChild(script);
      }),
    []
  );
  return null;
}
