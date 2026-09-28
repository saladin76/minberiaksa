"use client";

import type { ConciergeEventName } from "./events";

/**
 * Browser-side helpers for the concierge: the session id that ties a visit's
 * steps together, the "this basket went through the concierge" marker the
 * checkout attaches to the order, and the fire-and-forget event reporter.
 * Nothing here is authoritative  it is analytics context only.
 */

export const CONCIERGE_OPEN_EVENT = "mia:concierge-open";
const SESSION_KEY = "mia_concierge_session";
const ASSIST_KEY = "mia_concierge_assist";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  if (isBrowser() && window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** One id per browser session (tab), minted on first use. */
export function getConciergeSessionId(): string {
  if (!isBrowser()) return "server";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const id = randomId();
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

export interface ConciergeAssist {
  sessionId: string;
  intent: string | null;
  campaignId: string | null;
  at: number;
}

/** Remember that the concierge put something in the basket; read by checkout. */
export function markConciergeAssisted(input: { intent: string | null; campaignId: string | null }): void {
  if (!isBrowser()) return;
  try {
    const value: ConciergeAssist = { sessionId: getConciergeSessionId(), intent: input.intent, campaignId: input.campaignId, at: Date.now() };
    window.sessionStorage.setItem(ASSIST_KEY, JSON.stringify(value));
  } catch {
    /* Private mode; attribution is best effort. */
  }
}

export function readConciergeAssisted(): ConciergeAssist | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(ASSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConciergeAssist>;
    if (typeof parsed.sessionId !== "string") return null;
    return { sessionId: parsed.sessionId, intent: parsed.intent ?? null, campaignId: parsed.campaignId ?? null, at: parsed.at ?? 0 };
  } catch {
    return null;
  }
}

/**
 * "This browser talked to the concierge"  kept in localStorage (not the
 * tab's sessionStorage) with the time of the last exchange, so a donation made
 * later, even on another visit, can be counted as indirectly influenced. The
 * dashboard applies its own attribution window to `at`.
 */
const TOUCH_KEY = "mia_concierge_touch";
const TOUCH_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface ConciergeTouch {
  sessionId: string;
  at: number;
}

export function markConciergeTouched(): void {
  if (!isBrowser()) return;
  try {
    const value: ConciergeTouch = { sessionId: getConciergeSessionId(), at: Date.now() };
    window.localStorage.setItem(TOUCH_KEY, JSON.stringify(value));
  } catch {
    /* Private mode; attribution is best effort. */
  }
}

export function readConciergeTouched(): ConciergeTouch | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(TOUCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConciergeTouch>;
    if (typeof parsed.sessionId !== "string" || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > TOUCH_MAX_AGE_MS) return null;
    return { sessionId: parsed.sessionId, at: parsed.at };
  } catch {
    return null;
  }
}

export function clearConciergeAssisted(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(ASSIST_KEY);
  } catch {
    /* ignore */
  }
}

export interface ClientConciergeEvent {
  event: ConciergeEventName;
  route?: string | null;
  intent?: string | null;
  campaignId?: string | null;
  categoryId?: string | null;
  amountUSD?: number | null;
  frequency?: string | null;
}

/** Report browser-side funnel steps; survives navigation via keepalive. */
export function reportConciergeEvents(locale: string, events: ClientConciergeEvent[]): void {
  if (!isBrowser() || !events.length) return;
  const body = JSON.stringify({ sessionId: getConciergeSessionId(), locale, events });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/ai/donation-concierge/events", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch("/api/ai/donation-concierge/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

/** Ask the launcher to open, optionally with a message to send straight away. */
export function openConcierge(detail: { message?: string; intent?: string } = {}): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(CONCIERGE_OPEN_EVENT, { detail }));
}
