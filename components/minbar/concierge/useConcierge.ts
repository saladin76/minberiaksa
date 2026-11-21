"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTracking } from "@/components/TrackingPixels";
import { miaPath, routeForPathname, type MinbarRoute } from "@/lib/minbar/routes";
import { addToCart, readCart, type CartFreqKey, type CartGiftDetails } from "@/lib/minbar/cart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { ConciergeAction, ConciergeIntent, ConciergeResponse, ConciergeStep, ConversationState, PageContext } from "@/lib/ai/concierge/schema";
import { getConciergeSessionId, markConciergeAssisted, markConciergeTouched, reportConciergeEvents, type ClientConciergeEvent } from "@/lib/ai/concierge/client";

/**
 * Client state machine for the concierge. Talks to
 * `POST /api/ai/donation-concierge`, renders whatever typed blocks come back,
 * and performs the actions itself  adding to the basket through
 * `lib/minbar/cart.ts` exactly as the project page does, navigating through
 * `miaPath`, and reporting funnel steps through the tracking context (GA4
 * custom events) and the concierge events endpoint.
 */

export interface ConciergeTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks: ConciergeResponse["blocks"];
  actions: ConciergeAction[];
  error?: boolean;
}

export interface AddInput {
  campaign: { id: string; slug: string; title: string } | null;
  category: { id: string; title: string } | null;
  genericTitleKey: string | null;
  typeKey: "project" | "zakat";
  amountUSD: number;
  frequency: CartFreqKey;
  gift: CartGiftDetails | null;
}

export interface WaqfAddInput {
  unit: "share" | "meter";
  count: number;
  donorName: string;
  onBehalf: string;
  priceUSD: number;
  monthly: boolean;
}

/** Project slug from `/{locale}/{projects-slug}/{slug}`. */
function projectSlugFrom(pathname: string, route: MinbarRoute | null): string | null {
  if (route !== "projectDetail") return null;
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 3 ? decodeURIComponent(parts[2]) : null;
}

let turnSeq = 0;
const nextId = () => `t${Date.now().toString(36)}${(turnSeq++).toString(36)}`;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
let fallbackSessionId: string | null = null;
/** The server accepts 8–64 of [A-Za-z0-9_-]; anything else (blocked storage, an old format) gets a fresh id. */
function safeSessionId(id: unknown): string {
  if (typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id)) return id;
  fallbackSessionId ??= `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return fallbackSessionId;
}
/** Keeps only what the request schema accepts, so one stale field cannot reject the whole request. */
function cleanState(s: ConversationState & { cartCampaignIds?: string[] }): ConversationState & { cartCampaignIds?: string[] } {
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && OBJECT_ID.test(x)).slice(0, max) : undefined);
  const out: Record<string, unknown> = { ...s };
  out.shownCampaignIds = ids(s.shownCampaignIds, 30);
  out.cartCampaignIds = ids(s.cartCampaignIds, 50);
  if (typeof out.selectedCampaignId === "string" && !OBJECT_ID.test(out.selectedCampaignId)) delete out.selectedCampaignId;
  for (const k of ["turns", "amountTurn"]) if (typeof out[k] === "number" && ((out[k] as number) > 50 || (out[k] as number) < 0)) delete out[k];
  if (typeof out.region === "string") out.region = (out.region as string).slice(0, 60);
  if (typeof out.giftRecipientName === "string") out.giftRecipientName = (out.giftRecipientName as string).slice(0, 120);
  return out as ConversationState & { cartCampaignIds?: string[] };
}

export function useConcierge() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const tracking = useTracking();
  const { currency } = useMinbarMoney();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<ConciergeTurn[]>([]);
  const [state, setState] = useState<ConversationState>({});
  const opened = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const route = useMemo(() => routeForPathname(pathname), [pathname]);
  const page: PageContext = useMemo(() => ({ route, projectSlug: projectSlugFrom(pathname, route), pathname: pathname.slice(0, 300) }), [pathname, route]);

  const track = useCallback(
    (event: ClientConciergeEvent["event"], data: Omit<ClientConciergeEvent, "event"> = {}) => {
      tracking?.trackMissingEvent(`ai_${event}`, { ...data, route: route ?? undefined, locale });
      reportConciergeEvents(locale, [{ event, route, ...data }]);
    },
    [tracking, route, locale]
  );

  const cartCampaignIds = useCallback((): string[] => {
    /* Only ids are known to the server; slugs are mapped there through the catalog. */
    return readCart()
      .map((i) => i.upsellId ?? "")
      .filter((id) => /^[0-9a-fA-F]{24}$/.test(id));
  }, []);

  const call = useCallback(
    async (input: { message?: string; step?: ConciergeStep }, echo?: string) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      if (echo) setTurns((t) => [...t, { id: nextId(), role: "user", text: echo, blocks: [], actions: [] }]);
      /* Anything beyond the greeting is a real exchange (see markConciergeTouched). */
      if (input.message || (input.step && input.step.kind !== "open")) markConciergeTouched();
      setLoading(true);
      try {
        const history = turns.slice(-6).filter((t) => !t.error).map((t) => ({ role: t.role, text: t.text.slice(0, 1200) }));
        /* A request the server rejects (400) showed "assistant unavailable" (two donors on 2026-11-21). The body is
           cleaned first (valid session id, only well-formed ids in the state), and a rejected request is retried
           once without state or history, so a stale conversation can never lock the assistant. */
        const sessionId = safeSessionId(getConciergeSessionId());
        const base = {
          sessionId,
          locale,
          ...(currency && /^[A-Z]{3}$/.test(currency) ? { currency } : {}),
          page: { ...page, pathname: (page.pathname ?? "").slice(0, 300) },
          ...(input.message ? { message: input.message } : {}),
          ...(input.step ? { step: input.step } : {}),
          ...(input.step && echo ? { label: echo.slice(0, 200) } : {}),
        };
        const post = (body: object) => fetch("/api/ai/donation-concierge", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
        let res = await post({ ...base, state: cleanState({ ...state, cartCampaignIds: cartCampaignIds() }), history });
        if (res.status === 400) res = await post(base);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ConciergeResponse;
        setState(data.state);
        setTurns((t) => [...t, { id: nextId(), role: "assistant", text: data.message, blocks: data.blocks, actions: data.actions }]);
        return data;
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return null;
        setTurns((t) => [...t, { id: nextId(), role: "assistant", text: "", blocks: [], actions: [], error: true }]);
        return null;
      } finally {
        if (abort.current === controller) setLoading(false);
      }
    },
    [locale, currency, page, state, turns, cartCampaignIds]
  );

  const openPanel = useCallback(
    (initial?: { message?: string; intent?: ConciergeIntent }) => {
      setOpen(true);
      if (!opened.current) {
        opened.current = true;
        track("assistant_opened");
        if (initial?.message) void call({ message: initial.message }, initial.message);
        else if (initial?.intent) void call({ step: { kind: "intent", intent: initial.intent } });
        else void call({ step: { kind: "open" } });
      } else if (initial?.message) {
        void call({ message: initial.message }, initial.message);
      } else if (initial?.intent) {
        void call({ step: { kind: "intent", intent: initial.intent } });
      }
    },
    [call, track]
  );

  const close = useCallback(() => setOpen(false), []);

  const restart = useCallback(() => {
    abort.current?.abort();
    setTurns([]);
    setState({});
    opened.current = true;
    void call({ step: { kind: "open" } });
  }, [call]);

  const send = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text || loading) return;
      track("message_sent");
      void call({ message: text }, text);
    },
    [call, loading, track]
  );

  const navigate = useCallback(
    (routeName: string, extra: string[] = []) => {
      setOpen(false);
      router.push(miaPath(routeName as MinbarRoute, locale, ...extra));
    },
    [router, locale]
  );

  const act = useCallback(
    (action: ConciergeAction, label?: string) => {
      switch (action.type) {
        case "intent":
          track("intent_selected", { intent: action.intent });
          void call({ step: { kind: "intent", intent: action.intent } }, label ?? action.label);
          return;
        case "select_campaign":
          void call({ step: { kind: "select_campaign", campaignId: action.campaignId } }, label ?? action.label);
          return;
        case "select_category":
          void call({ step: { kind: "select_category", categoryId: action.categoryId } }, label ?? action.label);
          return;
        case "show_more":
          void call({ step: { kind: "show_more" } }, label ?? action.label);
          return;
        case "configure":
          if (action.campaignId) void call({ step: { kind: "select_campaign", campaignId: action.campaignId } }, label ?? action.label);
          else if (action.categoryId) void call({ step: { kind: "select_category", categoryId: action.categoryId } }, label ?? action.label);
          return;
        case "navigate":
          if (action.track === "campaign_viewed") track("campaign_viewed", { campaignId: state.selectedCampaignId ?? undefined });
          else if (action.track === "zakat_started") track("zakat_started");
          else if (action.track === "waqf_started") track("waqf_started");
          navigate(action.route, action.extra ?? []);
          return;
        case "open_cart":
          track("cart_opened");
          navigate("cart");
          return;
        case "checkout":
          track("checkout_started");
          navigate("checkout");
          return;
      }
    },
    [call, navigate, track, state.selectedCampaignId]
  );

  /** Put a configured donation in the basket, then ask the server for the confirmation step. */
  const addDonation = useCallback(
    (input: AddInput) => {
      addToCart({
        ...(input.campaign ? { projectId: input.campaign.slug, title: input.campaign.title, upsellId: input.campaign.id } : {}),
        ...(input.category ? { categoryId: input.category.id, title: input.category.title } : {}),
        ...(input.genericTitleKey ? { titleKey: input.genericTitleKey } : {}),
        typeKey: input.typeKey,
        freqKey: input.frequency,
        amount: input.amountUSD,
        currency: "USD",
        ...(input.gift ? { gift: input.gift } : {}),
      });
      markConciergeAssisted({ intent: state.intent ?? null, campaignId: input.campaign?.id ?? null });
      tracking?.trackAddToCart({
        value: input.amountUSD,
        currency: "USD",
        contentIds: [input.campaign?.id ?? input.category?.id ?? input.genericTitleKey ?? "generic"],
        contentName: input.campaign?.title ?? input.category?.title ?? undefined,
      });
      track("donation_added_to_cart", { campaignId: input.campaign?.id ?? null, categoryId: input.category?.id ?? null, amountUSD: input.amountUSD, frequency: input.frequency });
      void call({
        step: {
          kind: "added",
          campaignId: input.campaign?.id ?? null,
          categoryId: input.category?.id ?? null,
          amountUSD: input.amountUSD,
          frequency: input.frequency,
          gift: Boolean(input.gift),
        },
      });
    },
    [call, state.intent, track, tracking]
  );

  const addWaqf = useCallback(
    (input: WaqfAddInput) => {
      const total = input.priceUSD * input.count;
      addToCart({
        titleKey: input.unit === "meter" ? "unitMeter" : "unitShare",
        typeKey: "waqf",
        freqKey: input.monthly ? "monthly" : "once",
        amount: total,
        currency: "USD",
        waqf: { unit: input.unit, count: input.count, donorName: input.donorName.trim(), onBehalf: input.onBehalf.trim() },
      });
      markConciergeAssisted({ intent: "waqf", campaignId: null });
      tracking?.trackAddToCart({ value: total, currency: "USD", contentIds: [`waqf-${input.unit}`], quantity: input.count });
      track("donation_added_to_cart", { amountUSD: total, frequency: input.monthly ? "monthly" : "once" });
      void call({ step: { kind: "added", amountUSD: total, frequency: input.monthly ? "monthly" : "once", waqf: true } });
    },
    [call, track, tracking]
  );

  /* Other components (the project page CTA) open the panel through a window event. */
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string; intent?: ConciergeIntent }>).detail ?? {};
      openPanel(detail);
    };
    window.addEventListener("mia:concierge-open", onOpen);
    return () => window.removeEventListener("mia:concierge-open", onOpen);
  }, [openPanel]);

  return { open, loading, turns, state, route, openPanel, close, restart, send, act, addDonation, addWaqf };
}
