"use client";

import React, { useEffect, useRef, createContext, useContext, useCallback, useState } from "react";
import { track as vercelTrack } from "@vercel/analytics";
import {
  generateEventId,
  metaDonationEventId,
  META_EVENT_MAP,
  TIKTOK_EVENT_MAP,
  GA4_EVENT_MAP,
  type CanonicalEvent,
  type CanonicalEventName,
  type CanonicalUser,
  type CanonicalPayment,
} from "@/lib/tracking/canonical";

// ─── Vercel Analytics: which canonical events to forward ──────────────────────
// Skip page_view (Vercel's <Analytics/> handles it), scroll_depth, and
// user_engagement (too noisy for the custom-events dashboard). donation_complete
// is intentionally absent — that event is server-only (Meta CAPI from the
// payment webhook) so there's no browser path that emits it.
const VERCEL_FORWARDED_EVENTS = new Set<CanonicalEventName>([
  "view_content",
  "view_donation_page",
  "customize_product",
  "add_to_cart",
  "begin_checkout",
  "add_payment_info",
  "payment_submit",
  "payment_failed",
  "sign_up",
]);

/** Build a flat, Vercel-safe property bag from a CanonicalEvent.
 *  Vercel custom events allow only strings/numbers/booleans/null,
 *  no nested objects, ≤255 chars per value. */
function toVercelProps(event: CanonicalEvent): Record<string, string | number | boolean | null> {
  const props: Record<string, string | number | boolean | null> = {};
  const d = event.donation;
  const p = event.payment;
  const truncate = (v: string) => (v.length > 250 ? v.slice(0, 250) : v);

  if (d?.amount != null)         props.amount         = d.amount;
  if (d?.amount_usd != null)     props.amount_usd     = d.amount_usd;
  if (d?.currency)               props.currency       = d.currency;
  if (d?.cause_id)               props.cause_id       = truncate(d.cause_id);
  if (d?.cause_name)             props.cause_name     = truncate(d.cause_name);
  if (d?.donation_type)          props.donation_type  = d.donation_type;
  if (d?.recurring != null)      props.recurring      = d.recurring;
  if (d?.status)                 props.status         = truncate(d.status);

  if (p?.gateway)                props.gateway        = p.gateway;
  if (p?.is_3ds != null)         props.is_3ds         = p.is_3ds;
  if (p?.transaction_id)         props.transaction_id = truncate(p.transaction_id);
  if (p?.failure_reason)         props.failure_reason = truncate(p.failure_reason);
  if (p?.payment_status)         props.payment_status = p.payment_status;

  if (event.items?.length)       props.num_items      = event.items.length;
  if (event.page?.language)      props.lang           = event.page.language;

  // Surface scroll/engagement milestones if present
  const c = event.custom as Record<string, unknown> | undefined;
  if (c) {
    if (typeof c.percent === "number")   props.percent   = c.percent;
    if (typeof c.milestone === "string") props.milestone = truncate(c.milestone);
  }

  return props;
}

// ─── Public config (pixel IDs only — no tokens) ───────────────────────────────
export interface TrackingConfig {
  facebookPixelId: string | null;
  gaMeasurementId: string | null;
  tiktokPixelId: string | null;
  xPixelId: string | null;
}

// ─── Legacy option types (kept for backward compat) ──────────────────────────

export interface TrackingItem {
  item_id: string;
  item_name?: string;
  price?: number;
  quantity?: number;
  item_category?: string;
}

interface TrackAddToCartOptions {
  value: number;
  currency?: string;
  contentIds?: string[];
  contentName?: string;
  quantity?: number;
  items?: TrackingItem[];
}

interface TrackInitiateCheckoutOptions {
  value: number;
  currency?: string;
  numItems: number;
  contentIds?: string[];
  items?: TrackingItem[];
  donationType?: "ONE_TIME" | "MONTHLY";
}

interface TrackViewContentOptions {
  contentName?: string;
  contentIds?: string[];
  value?: number;
  currency?: string;
  contentType?: string;
}

interface TrackCustomizeProductOptions {
  donationType?: "ONE_TIME" | "MONTHLY";
  amount?: number;
  currency?: string;
  causeId?: string;
  causeName?: string;
}

interface TrackAddPaymentInfoOptions {
  value: number;
  currency?: string;
  causeId?: string;
  causeName?: string;
  paymentMethod?: string;
}

interface TrackDonateOptions {
  value: number;
  currency?: string;
  causeId?: string;
  causeName?: string;
  donationType?: "ONE_TIME" | "MONTHLY";
  gateway?: string;
  is3ds?: boolean;
}

interface TrackPaymentFailedOptions {
  value?: number;
  currency?: string;
  causeId?: string;
  reason?: string;
  gateway?: string;
  /** Donation row id when known. Used by GA4 / Vercel as the order_id of the
   *  failed attempt. Meta does NOT fire from the browser — the DonateFailed
   *  CAPI event is owned by `sendDonationFailedConversions` server-side, keyed
   *  by `donation.id`. See lib/tracking/donation-conversion-server.ts. */
  donationId?: string;
}

/** Single Meta-Pixel "Donate" fire from the /success page. The browser pixel
 *  is paired with a server CAPI fire from POST /api/donations/:id/track-conversion
 *  — Meta dedupes by the shared event_id. Don't call this from anywhere except
 *  the /success page, and only after the donation is confirmed PAID in the DB
 *  AND the track-conversion endpoint returned `allowed: true`. */
interface TrackDonateSuccessOptions {
  /** Donation row id. Used to build the dedup-stable event_id. */
  donationId: string;
  /** Amount as charged in the DB. Must match what the CAPI fire uses. */
  value: number;
  /** Currency as stored on the donation row. Must match the CAPI fire. */
  currency: string;
  /** Campaign / category IDs this donation funded. */
  contentIds?: string[];
  /** Per-item breakdown matching Meta's `contents` array. */
  contents?: Array<{ id: string; quantity?: number; item_price?: number }>;
  /** Human-readable cause for Events Manager. */
  contentName?: string;
  /** "donation" | "monthly" | "qurbani" | … */
  contentCategory?: string;
  donationType?: "ONE_TIME" | "MONTHLY";
  paymentMethod?: string;
}

// ─── Context value ────────────────────────────────────────────────────────────

interface TrackingContextValue {
  config: TrackingConfig | null;
  setUserData: (user: Partial<CanonicalUser>) => void;
  trackCompleteRegistration: () => void;
  trackViewContent: (params?: TrackViewContentOptions) => void;
  trackAddToCart: (options: TrackAddToCartOptions) => void;
  trackInitiateCheckout: (options: TrackInitiateCheckoutOptions) => void;
  trackPageView: (pagePath?: string, pageTitle?: string) => void;
  trackCustomizeProduct: (options: TrackCustomizeProductOptions) => void;
  trackAddPaymentInfo: (options: TrackAddPaymentInfoOptions) => void;
  trackPaymentSubmit: (options: TrackDonateOptions) => void;
  trackPaymentFailed: (options: TrackPaymentFailedOptions) => void;
  trackDonate: (options: TrackDonateSuccessOptions) => void;
  trackMissingEvent: (customEventName: string, data?: Record<string, unknown>) => void;
}

const TrackingContext = createContext<TrackingContextValue | null>(null);

export function useTracking(): TrackingContextValue | null {
  return useContext(TrackingContext);
}

// ─── Window augmentation ──────────────────────────────────────────────────────

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    ttq?: {
      load: (id: string) => void;
      page: () => void;
      track: (event: string, payload?: object) => void;
      identify: (data: object) => void;
      methods?: string[];
      setAndDefer?: (o: unknown, m: string) => void;
      push: (args: unknown) => void;
    };
    twq?: (action: string, ...args: unknown[]) => void;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return reject(new Error("no document"));
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function getCookieValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];
}

function getUrlParam(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get(key) ?? undefined;
}

/** Persist ttclid / gclid / fbclid in sessionStorage so they survive page navigations */
function captureClickIds(): { ttclid?: string; gclid?: string; fbclid?: string } {
  if (typeof window === "undefined") return {};
  const ttclid = getUrlParam("ttclid") || sessionStorage.getItem("_ttclid") || undefined;
  const gclid  = getUrlParam("gclid")  || sessionStorage.getItem("_gclid")  || undefined;
  const fbclid = getUrlParam("fbclid") || undefined;
  if (ttclid) sessionStorage.setItem("_ttclid", ttclid);
  if (gclid)  sessionStorage.setItem("_gclid",  gclid);
  return { ttclid, gclid, fbclid };
}

function buildGa4Items(
  contentIds: string[] | undefined,
  value: number,
  contentName?: string,
  quantity = 1
): TrackingItem[] {
  if (contentIds?.length) {
    return contentIds.map((id) => ({
      item_id: id,
      item_name: contentName || `Item ${id}`,
      price: contentIds.length === 1 ? value : value / contentIds.length,
      quantity,
    }));
  }
  return [{ item_id: "donation", item_name: contentName || "Donation", price: value, quantity }];
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export default function TrackingPixels({ children }: { children: React.ReactNode }) {
  const configRef = useRef<TrackingConfig | null>(null);
  const [config, setConfig] = useState<TrackingConfig | null>(null);
  // Mutable user data — updated by DonationDialog when user fills in details
  const userDataRef = useRef<Partial<CanonicalUser>>({});

  // ── Load pixel config ───────────────────────────────────────────────────────
  // Defer the config fetch + script injection until either the user interacts with the
  // page or 6 s have elapsed. Ad/marketing pixels (FB ~226KiB, TikTok, X) used to
  // compete with the LCP image for bandwidth and ate ~700 ms of TBT during the first
  // second; the interaction-or-long-idle gate moves all of that off the critical path
  // (Lighthouse never interacts so it never sees them) while still firing well before
  // any real user can convert.
  //
  // EXCEPTION: /success/[id] is a conversion page — we need fbq ready immediately so
  // `trackDonate` can fire the Meta "Donate" event without waiting for scroll or 6 s
  // idle. Donors often arrive there post-redirect and may close the tab quickly.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let fired = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const load = () => {
      if (fired) return;
      fired = true;
      cleanup();

      fetch("/api/tracking/config")
        .then((r) => r.json())
        .then((data) => {
          const c: TrackingConfig = {
            facebookPixelId: data.facebookPixelId || null,
            gaMeasurementId: data.gaMeasurementId || null,
            tiktokPixelId:   data.tiktokPixelId   || null,
            xPixelId:        data.xPixelId        || null,
          };
          configRef.current = c;
          setConfig(c);
        })
        .catch(() => setConfig(null));
    };

    const cleanup = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      window.removeEventListener("scroll", load);
      window.removeEventListener("pointerdown", load);
      window.removeEventListener("keydown", load);
      window.removeEventListener("touchstart", load);
    };

    // Fire-now path for conversion pages. The match is locale-agnostic — any
    // pathname segment "/success/<id>" qualifies.
    const isConversionPage = /\/success\/[^/]+/.test(window.location.pathname);
    if (isConversionPage) {
      load();
      return cleanup;
    }

    timeoutId = setTimeout(load, 6000);
    window.addEventListener("scroll", load, { passive: true, once: true });
    window.addEventListener("pointerdown", load, { once: true });
    window.addEventListener("keydown", load, { once: true });
    window.addEventListener("touchstart", load, { passive: true, once: true });

    return cleanup;
  }, []);

  // ── Inject pixel scripts once config is ready ────────────────────────────────
  useEffect(() => {
    if (!config) return;

    // Facebook Pixel (Meta)
    if (config.facebookPixelId) {
      const id = config.facebookPixelId;
      (function (_f: unknown, b: Window, e: string, v: string) {
        if (b.fbq) return;
        interface FbqFn {
          (): void;
          callMethod?: (...a: unknown[]) => void;
          queue: unknown[];
          push: unknown;
          loaded: boolean;
          version: string;
        }
        const n: FbqFn = function () {
          n.callMethod ? n.callMethod(...arguments) : n.queue.push(arguments);
        } as FbqFn;
        b.fbq = n;
        if (!(b as Window & { _fbq?: FbqFn })._fbq) (b as Window & { _fbq?: FbqFn })._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = "2.0";
        n.queue = [];
        const t = document.createElement(e) as HTMLScriptElement;
        t.async = true;
        t.src = v;
        const s = document.getElementsByTagName(e)[0];
        s?.parentNode?.insertBefore(t, s);
      })(undefined, window, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq?.("init", id);
      window.fbq?.("track", "PageView");
    }

    // Google Analytics 4
    if (config.gaMeasurementId) {
      const id = config.gaMeasurementId;
      window.dataLayer = window.dataLayer || [];
      function gtag(..._args: unknown[]) {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments);
      }
      (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = gtag;
      gtag("js", new Date());
      gtag("config", id, { send_page_view: true });
      loadScript(`https://www.googletagmanager.com/gtag/js?id=${id}`).catch(() => {});
    }

    // TikTok Pixel
    if (config.tiktokPixelId) {
      const id = config.tiktokPixelId;
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.innerHTML = `
        !function(w,d,t){
          w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
          ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],
          ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
          for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
          ttq.load=function(e){var n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src="https://analytics.tiktok.com/i18n/pixel/events.js?sdkid="+e+"&lib="+t;(d.getElementsByTagName("script")[0]||d.head).parentNode.insertBefore(n,d.getElementsByTagName("script")[0]||d.head);ttq._i=ttq._i||{},ttq._i[e]=[],ttq._t=ttq._t||{},ttq._t[e]=+new Date};
          ttq.load("${id.replace(/"/g, '\\"')}");ttq.page();
        }(window,document,"ttq");
      `;
      document.head.appendChild(script);
    }

    // X (Twitter) Pixel
    if (config.xPixelId) {
      const id = config.xPixelId;
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.innerHTML = `
        !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version="1.1",s.queue=[],u=t.createElement(n),u.async=!0,u.src="https://static.ads-twitter.com/uwt.js",a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,"script");
        twq("config","${id.replace(/"/g, '\\"')}");
      `;
      document.head.appendChild(script);
    }
  }, [config]);

  // ── Scroll depth tracking (25 / 50 / 75 / 100 %) ─────────────────────────────
  useEffect(() => {
    const fired = new Set<number>();
    const thresholds = [25, 50, 75, 100];

    const handler = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total    = document.documentElement.scrollHeight;
      const pct      = Math.floor((scrolled / total) * 100);
      for (const t of thresholds) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          sendCanonical({
            event:   "scroll_depth",
            event_id: generateEventId("scroll"),
            custom:  { percent: t },
          });
        }
      }
    };

    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── User engagement (time on page) ────────────────────────────────────────────
  useEffect(() => {
    const start = Date.now();
    let sent10 = false;
    let sent30 = false;

    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000);
      if (sec >= 10 && !sent10) {
        sent10 = true;
        sendCanonical({
          event:    "user_engagement",
          event_id: generateEventId("eng"),
          custom:   { engagement_time_msec: 10_000, milestone: "10s" },
        });
      }
      if (sec >= 30 && !sent30) {
        sent30 = true;
        clearInterval(interval);
        sendCanonical({
          event:    "user_engagement",
          event_id: generateEventId("eng"),
          custom:   { engagement_time_msec: 30_000, milestone: "30s" },
        });
      }
    }, 5_000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core canonical sender ─────────────────────────────────────────────────────

  /**
   * Build a full CanonicalEvent from partial input, fire browser pixels,
   * then POST to /api/track for server-side CAPI + TikTok Events API.
   *
   * Conversion pages (/success, /donation-failed) are off-limits to every
   * event except `donation_complete` (which is owned by `trackDonate` and
   * does NOT route through here). Anything else firing on these paths is
   * either a stray dialog mount or a misfired effect — both contaminate
   * Meta's funnel with phantom events on the conversion landing.
   */
  const sendCanonical = useCallback(
    (partial: Omit<CanonicalEvent, "event_time"> & { event_time?: number }) => {
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (/\/(success|donation-failed)(\/|$)/.test(path)) {
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("[tracking] suppressed canonical event on conversion page", {
              event: partial.event,
              path,
            });
          }
          return;
        }
      }
      const ids = captureClickIds();
      const event: CanonicalEvent = {
        event_time: Math.floor(Date.now() / 1000),
        ...partial,
        page: {
          url:      typeof window !== "undefined" ? window.location.href  : undefined,
          referrer: typeof document !== "undefined" ? document.referrer   : undefined,
          title:    typeof document !== "undefined" ? document.title      : undefined,
          language: typeof navigator !== "undefined" ? navigator.language : undefined,
          ...partial.page,
        },
        session: {
          ttclid: ids.ttclid,
          gclid:  ids.gclid,
          fbclid: ids.fbclid,
          ...partial.session,
        },
        user: {
          fbp:        getCookieValue("_fbp"),
          fbc:        getCookieValue("_fbc") || (ids.fbclid ? `fb.1.${Date.now()}.${ids.fbclid}` : undefined),
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          ...userDataRef.current,
          ...partial.user,
        },
      };

      const c = configRef.current;

      // ── Meta Pixel (browser) ──────────────────────────────────────────────
      const metaEventName = META_EVENT_MAP[event.event];
      if (c?.facebookPixelId && window.fbq && metaEventName) {
        const d = event.donation ?? {};
        const p = event.payment  ?? {};
        const fbData: Record<string, unknown> = {};
        // Core value
        if (d.amount ?? d.amount_usd) fbData.value    = d.amount ?? d.amount_usd;
        if (d.currency)               fbData.currency = d.currency;
        // Content IDs / Contents
        if (event.items?.length) {
          fbData.content_ids = event.items.map((i) => i.item_id);
          fbData.contents    = event.items.map((i) => ({ id: i.item_id, quantity: i.quantity ?? 1, item_price: i.price ?? 0 }));
          fbData.num_items   = event.items.reduce((s: number, i) => s + (i.quantity ?? 1), 0);
        } else if (d.cause_id) {
          fbData.content_ids = [d.cause_id];
          fbData.contents    = [{ id: d.cause_id, quantity: 1, item_price: d.amount ?? d.amount_usd ?? 0 }];
          fbData.num_items   = 1;
        }
        // Content metadata
        fbData.content_type = "product";
        if (d.content_name ?? d.cause_name)        fbData.content_name          = d.content_name ?? d.cause_name;
        if (d.content_category ?? d.donation_type) fbData.content_category      = d.content_category ?? d.donation_type?.toLowerCase();
        if (d.delivery_category)                    fbData.delivery_category     = d.delivery_category;
        if (d.description)                          fbData.description           = d.description;
        if (d.status)                               fbData.status                = d.status;
        if (d.payment_info_available != null)       fbData.payment_info_available = d.payment_info_available;
        if (d.predicted_ltv != null)                fbData.predicted_ltv         = d.predicted_ltv;
        if (p.transaction_id)                       fbData.order_id              = p.transaction_id;
        window.fbq("track", metaEventName, fbData, { eventID: event.event_id });
      }

      // ── TikTok Pixel (browser) ────────────────────────────────────────────
      const tiktokEventName = TIKTOK_EVENT_MAP[event.event];
      if (c?.tiktokPixelId && window.ttq && tiktokEventName) {
        const d = event.donation ?? {};
        window.ttq.track(tiktokEventName, {
          value:        d.amount ?? d.amount_usd,
          currency:     d.currency,
          content_id:   event.items?.[0]?.item_id ?? d.cause_id,
          content_name: d.cause_name,
          content_type: "product",
          event_id:     event.event_id,  // TikTok dedup key
        });
      }

      // ── GA4 ───────────────────────────────────────────────────────────────
      const ga4EventName = GA4_EVENT_MAP[event.event];
      if (c?.gaMeasurementId && window.gtag && ga4EventName) {
        const d  = event.donation ?? {};
        const p  = event.payment  ?? {};
        const u  = event.user     ?? {};
        const ga4: Record<string, unknown> = {};
        if (d.amount ?? d.amount_usd) ga4.value    = d.amount ?? d.amount_usd;
        if (d.currency)               ga4.currency  = d.currency;
        if (p.transaction_id)         ga4.transaction_id = p.transaction_id;
        if (event.items?.length) {
          ga4.items = event.items.map((i) => ({
            item_id:       i.item_id,
            item_name:     i.item_name,
            item_category: i.item_category,
            price:         i.price,
            quantity:      i.quantity ?? 1,
          }));
        }
        // User / customer info — for GTM enhanced matching and Meta CAPI via GTM
        if (u.email)            ga4.email            = u.email;
        if (u.phone)            ga4.phone            = u.phone;
        if (u.first_name)       ga4.first_name       = u.first_name;
        if (u.last_name)        ga4.last_name        = u.last_name;
        if (u.gender)           ga4.gender           = u.gender;
        if (u.date_of_birth)    ga4.date_of_birth    = u.date_of_birth;
        if (u.city)             ga4.city             = u.city;
        if (u.state)            ga4.state            = u.state;
        if (u.zip)              ga4.zip              = u.zip;
        if (u.country_code)     ga4.country          = u.country_code;
        if (u.external_id)      ga4.external_id      = u.external_id;
        if (u.fbp)              ga4.fbp              = u.fbp;
        if (u.fbc)              ga4.fbc              = u.fbc;
        if (u.subscription_id)  ga4.subscription_id  = u.subscription_id;
        if (u.user_agent)       ga4.user_agent       = u.user_agent;
        if (event.custom) Object.assign(ga4, event.custom);
        window.gtag("event", ga4EventName, ga4);
      }

      // ── X (Twitter) ───────────────────────────────────────────────────────
      if (c?.xPixelId && window.twq) {
        const d = event.donation ?? {};
        window.twq("event", c.xPixelId, {
          tw_sale_amount:    d.amount ?? d.amount_usd,
          tw_order_quantity: event.items?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 1,
        });
      }

      // ── Vercel Analytics (custom events) ─────────────────────────────────
      if (VERCEL_FORWARDED_EVENTS.has(event.event)) {
        try { vercelTrack(event.event, toVercelProps(event)); } catch { /* never block */ }
      }

      // ── Server (CAPI + TikTok Events API) ────────────────────────────────
      // Fire-and-forget — don't block UI
      fetch("/api/track", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(event),
        keepalive: true,
      }).catch(() => {});
    },
    []
  );

  // ── Public API ────────────────────────────────────────────────────────────────

  const setUserData = useCallback((user: Partial<CanonicalUser>) => {
    userDataRef.current = { ...userDataRef.current, ...user };
    // Also identify in TikTok Pixel
    if (configRef.current?.tiktokPixelId && window.ttq?.identify) {
      const u = userDataRef.current;
      window.ttq.identify({
        external_id: u.external_id,
        email:       u.email,
        phone_number: u.phone,
      });
    }
  }, []);

  const trackPageView = useCallback((pagePath?: string, pageTitle?: string) => {
    sendCanonical({
      event:    "page_view",
      event_id: generateEventId("pv"),
      page:     { url: pagePath, title: pageTitle },
    });
  }, [sendCanonical]);

  const trackViewContent = useCallback((params?: TrackViewContentOptions) => {
    sendCanonical({
      event:    "view_content",
      event_id: generateEventId("vc"),
      donation: {
        cause_id:   params?.contentIds?.[0],
        cause_name: params?.contentName,
        amount:     params?.value,
        currency:   params?.currency,
      },
      items: params?.contentIds?.map((id) => ({
        item_id:   id,
        item_name: params.contentName,
        price:     params.value,
        quantity:  1,
      })),
    });
  }, [sendCanonical]);

  const trackAddToCart = useCallback((options: TrackAddToCartOptions) => {
    const { value, currency = "USD", contentIds, contentName, quantity = 1, items } = options;
    sendCanonical({
      event:    "add_to_cart",
      event_id: generateEventId("atc"),
      donation: { amount: value, currency, cause_id: contentIds?.[0], cause_name: contentName },
      items:    items?.length
        ? items.map((i) => ({ ...i }))
        : buildGa4Items(contentIds, value, contentName, quantity).map((i) => ({ ...i })),
    });
  }, [sendCanonical]);

  const trackCustomizeProduct = useCallback((options: TrackCustomizeProductOptions) => {
    sendCanonical({
      event:    "customize_product",
      event_id: generateEventId("cp"),
      donation: {
        donation_type: options.donationType,
        amount:        options.amount,
        currency:      options.currency,
        cause_id:      options.causeId,
        cause_name:    options.causeName,
      },
      custom: { donation_type: options.donationType, amount: options.amount },
    });
  }, [sendCanonical]);

  const trackInitiateCheckout = useCallback((options: TrackInitiateCheckoutOptions) => {
    const { value, currency = "USD", numItems, contentIds, items, donationType } = options;
    sendCanonical({
      event:    "begin_checkout",
      event_id: generateEventId("chk"),
      donation: {
        amount:        value,
        currency,
        donation_type: donationType,
        cause_id:      contentIds?.[0],
      },
      items: items?.length
        ? items.map((i) => ({ ...i }))
        : buildGa4Items(contentIds, value, undefined, numItems).map((i) => ({ ...i })),
    });
  }, [sendCanonical]);

  const trackAddPaymentInfo = useCallback((options: TrackAddPaymentInfoOptions) => {
    sendCanonical({
      event:    "add_payment_info",
      event_id: generateEventId("api"),
      donation: {
        amount:     options.value,
        currency:   options.currency,
        cause_id:   options.causeId,
        cause_name: options.causeName,
      },
      payment: { method: options.paymentMethod },
      items: [{
        item_id:   options.causeId ?? "donation",
        item_name: options.causeName ?? "Donation",
        price:     options.value,
        quantity:  1,
      }],
    });
  }, [sendCanonical]);

  const trackPaymentSubmit = useCallback((options: TrackDonateOptions) => {
    sendCanonical({
      event:    "payment_submit",
      event_id: generateEventId("don"),
      donation: {
        amount:        options.value,
        currency:      options.currency,
        cause_id:      options.causeId,
        cause_name:    options.causeName,
        donation_type: options.donationType,
        recurring:     options.donationType === "MONTHLY",
      },
      payment: {
        gateway: options.gateway as CanonicalPayment["gateway"],
        is_3ds:  options.is3ds,
        payment_status: "pending",
      },
    });
  }, [sendCanonical]);

  const trackPaymentFailed = useCallback((options: TrackPaymentFailedOptions) => {
    // Browser-side payment_failed fires GA4 "exception" and Vercel Analytics
    // for funnel/diagnostics only. The Meta DonateFailed CAPI event is owned
    // by the SERVER (see donation-conversion-server.ts) — `payment_failed` is
    // deliberately absent from META_EVENT_MAP and listed in
    // META_CAPI_OFF_CHANNEL, so fbq does not fire here and /api/track
    // refuses to forward it.
    //
    // If we don't have a donationId yet (e.g. POST /api/donations itself
    // threw), we don't synthesise one. The earlier fallback to
    // `generateEventId("fail")` produced phantom DonateFailed entries in Meta
    // that had no matching donation row. We just emit a canonical record
    // tagged "no-donation" so GA4 still gets the diagnostic ping.
    sendCanonical({
      event:    "payment_failed",
      event_id: options.donationId
        ? metaDonationEventId(options.donationId, "failed")
        : `fail_no_donation_${Date.now()}`,
      donation: {
        amount:   options.value,
        currency: options.currency,
        cause_id: options.causeId,
      },
      payment: {
        gateway:        options.gateway as CanonicalPayment["gateway"],
        payment_status: "failed",
        failure_reason: options.reason,
        transaction_id: options.donationId,
      },
    });
  }, [sendCanonical]);

  const trackCompleteRegistration = useCallback(() => {
    sendCanonical({
      event:    "sign_up",
      event_id: generateEventId("reg"),
    });
  }, [sendCanonical]);

  /**
   * Fire Meta Pixel "Donate" once for a confirmed-paid donation. Intentionally
   * does NOT route through `sendCanonical`:
   *   • No /api/track mirror — CAPI Donate is owned by
   *     POST /api/donations/:id/track-conversion, which already fired by the
   *     time the success page calls this. /api/track would refuse the event
   *     anyway (donation_complete is in META_CAPI_OFF_CHANNEL), but skipping
   *     the round trip is cleaner.
   *   • No TikTok / GA4 / X / Vercel fan-out — GA4 MP purchase is also fired
   *     server-side from the same endpoint; the other platforms don't have a
   *     wired donation_complete leg yet (see project memory).
   *
   * event_id matches what the server CAPI fire used (`donate_<donationId>`),
   * so Meta dedupes the browser↔server pair into a single conversion.
   */
  const trackDonate = useCallback((options: TrackDonateSuccessOptions) => {
    if (typeof window === "undefined") return;

    const eventId = metaDonationEventId(options.donationId, "success");

    const contents =
      options.contents?.length
        ? options.contents.map((c) => ({
            id: c.id,
            quantity: c.quantity ?? 1,
            item_price: c.item_price ?? 0,
          }))
        : options.contentIds?.length
          ? options.contentIds.map((id) => ({
              id,
              quantity: 1,
              item_price:
                options.contentIds!.length === 1
                  ? options.value
                  : options.value / options.contentIds!.length,
            }))
          : [{ id: "donation", quantity: 1, item_price: options.value }];

    const contentIds = options.contentIds?.length
      ? options.contentIds
      : contents.map((c) => c.id);

    const data: Record<string, unknown> = {
      value: options.value,
      currency: options.currency,
      content_type: "donation",
      content_ids: contentIds,
      contents,
      num_items: contents.reduce((s, c) => s + (c.quantity ?? 1), 0),
      content_name: options.contentName,
      content_category:
        options.contentCategory ??
        (options.donationType === "MONTHLY" ? "monthly" : "donation"),
      order_id: options.donationId,
      transaction_id: options.donationId,
      status: "paid",
      success: true,
      payment_info_available: true,
      donation_type:
        options.donationType === "MONTHLY" ? "monthly" : "one_time",
      payment_method: (options.paymentMethod ?? "card").toLowerCase(),
    };

    // Robust fire: if fbq + pixelId are ready right now, send immediately.
    // Otherwise poll briefly (the config fetch + script init takes a few
    // hundred ms on cold loads) and fire as soon as both arrive. The earlier
    // silent-bail behaviour was the root cause of "Donate event missing"
    // when the donor's success page beat the deferred pixel config to ready.
    const tryFire = (): boolean => {
      const fbq = window.fbq;
      if (!fbq) return false;
      if (!configRef.current?.facebookPixelId) return false;
      fbq("track", "Donate", data, { eventID: eventId });
      return true;
    };

    if (tryFire()) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~6s at 150ms intervals — well past pixel init
    const timer = setInterval(() => {
      attempts += 1;
      if (tryFire() || attempts >= MAX_ATTEMPTS) {
        clearInterval(timer);
        if (attempts >= MAX_ATTEMPTS && process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[Donate] fbq never became ready; CAPI fire is the only signal", {
            eventId,
            hasFbq: !!window.fbq,
            hasPixelId: !!configRef.current?.facebookPixelId,
          });
        }
      }
    }, 150);
  }, []);

  const trackMissingEvent = useCallback((customEventName: string, data?: Record<string, unknown>) => {
    sendCanonical({
      event:    "_missing_event",
      event_id: generateEventId("mis"),
      custom:   { custom_event_name: customEventName, ...data },
    });
    // Also fire as a custom GA4 event
    if (configRef.current?.gaMeasurementId && window.gtag) {
      window.gtag("event", customEventName, data ?? {});
    }
  }, [sendCanonical]);

  const value: TrackingContextValue = {
    config,
    setUserData,
    trackCompleteRegistration,
    trackViewContent,
    trackAddToCart,
    trackInitiateCheckout,
    trackPageView,
    trackCustomizeProduct,
    trackAddPaymentInfo,
    trackPaymentSubmit,
    trackPaymentFailed,
    trackDonate,
    trackMissingEvent,
  };

  return (
    <TrackingContext.Provider value={value}>
      {children}
    </TrackingContext.Provider>
  );
}
