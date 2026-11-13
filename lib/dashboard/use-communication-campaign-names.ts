"use client";

import { useEffect, useState } from "react";

/**
 * Resolves internal communication campaign ids to their names for display.
 * Requests from every badge on the page are batched into one call per tick and
 * cached for the session. `undefined` = still loading, `null` = not found / no access.
 */
const cache = new Map<string, string | null>();
const queued = new Set<string>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const ids = [...queued].slice(0, 100);
  ids.forEach((id) => { queued.delete(id); inFlight.add(id); });
  if (queued.size) timer = setTimeout(flush, 0);
  if (!ids.length) return;
  try {
    const res = await fetch(`/api/admin/communication-campaign-names?ids=${ids.join(",")}`, { credentials: "same-origin" });
    const data = res.ok ? ((await res.json()) as { names?: Record<string, string> }) : {};
    for (const id of ids) cache.set(id, typeof data.names?.[id] === "string" ? data.names[id] : null);
  } catch {
    for (const id of ids) cache.set(id, null);
  } finally {
    ids.forEach((id) => inFlight.delete(id));
    listeners.forEach((listener) => listener());
  }
}

export function useCommunicationCampaignName(id: string | null): string | null | undefined {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!id) return;
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    if (!cache.has(id) && !queued.has(id) && !inFlight.has(id)) {
      queued.add(id);
      if (!timer) timer = setTimeout(flush, 0);
    }
    return () => { listeners.delete(listener); };
  }, [id]);
  if (!id) return null;
  return cache.has(id) ? cache.get(id) ?? null : undefined;
}
