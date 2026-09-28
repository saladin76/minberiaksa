"use client";

import { useEffect, useState } from "react";
import type { PublicConciergeConfig } from "@/lib/ai/concierge/settings-shape";

/**
 * The launcher's switches from the dashboard (`/api/ai/donation-concierge/config`).
 * Fetched once per page load and shared by every component that asks; until it
 * arrives  or if it fails  the defaults apply, so the assistant is never
 * hidden by a slow or broken request.
 */

const DEFAULTS: PublicConciergeConfig = { enabled: true, teaser: true, teaserDelaySeconds: 6, pulse: true };
let pending: Promise<PublicConciergeConfig> | null = null;
let resolved: PublicConciergeConfig | null = null;

function load(): Promise<PublicConciergeConfig> {
  if (!pending) {
    pending = fetch("/api/ai/donation-concierge/config")
      .then((r) => (r.ok ? r.json() : DEFAULTS))
      .then((c: Partial<PublicConciergeConfig>) => (resolved = { ...DEFAULTS, ...c }))
      .catch(() => (resolved = DEFAULTS));
  }
  return pending;
}

export function useConciergeConfig(): { config: PublicConciergeConfig; ready: boolean } {
  const [config, setConfig] = useState<PublicConciergeConfig | null>(resolved);
  useEffect(() => {
    if (resolved) return;
    let alive = true;
    void load().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return { config: config ?? DEFAULTS, ready: config !== null };
}
