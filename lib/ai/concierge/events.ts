import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Funnel events for the concierge, one row per step
 * (`AiConciergeEvent`). The server writes the steps it sees itself; the
 * browser reports navigation-only steps through `/api/ai/donation-concierge/events`
 * with the same vocabulary. `donation_completed` is not written here: a paid
 * donation that went through the concierge carries the session id in
 * `Donation.attribution.ai_concierge`, and the funnel reads it from there.
 */

export const CONCIERGE_EVENTS = [
  "assistant_opened",
  "intent_selected",
  "message_sent",
  "recommendation_shown",
  "campaign_viewed",
  "campaign_selected",
  "donation_configured",
  "donation_added_to_cart",
  "cart_opened",
  "checkout_started",
  "zakat_started",
  "waqf_started",
  "recurring_selected",
  "gift_selected",
  "model_fallback",
  /* Written by the order API when a concierge-marked basket becomes an order. */
  "order_created",
  /* A message to the team was filed from the panel (support endpoint). */
  "support_ticket_sent",
] as const;
export type ConciergeEventName = (typeof CONCIERGE_EVENTS)[number];

export interface ConciergeEventInput {
  sessionId: string;
  event: ConciergeEventName;
  locale: string;
  route?: string | null;
  intent?: string | null;
  campaignId?: string | null;
  categoryId?: string | null;
  amountUSD?: number | null;
  frequency?: string | null;
  mode?: string | null;
  donationId?: string | null;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export async function recordConciergeEvents(events: ConciergeEventInput[]): Promise<void> {
  if (!events.length) return;
  try {
    await prisma.aiConciergeEvent.createMany({
      data: events.map((e) => ({
        sessionId: e.sessionId,
        event: e.event,
        locale: e.locale,
        route: e.route ?? null,
        intent: e.intent ?? null,
        campaignId: e.campaignId && OBJECT_ID.test(e.campaignId) ? e.campaignId : null,
        categoryId: e.categoryId && OBJECT_ID.test(e.categoryId) ? e.categoryId : null,
        amountUSD: typeof e.amountUSD === "number" && Number.isFinite(e.amountUSD) ? e.amountUSD : null,
        frequency: e.frequency ?? null,
        mode: e.mode ?? null,
        donationId: e.donationId && OBJECT_ID.test(e.donationId) ? e.donationId : null,
      })),
    });
  } catch (error) {
    /* Analytics must never fail the visitor's request. */
    console.error("[concierge] event write failed", error instanceof Error ? error.message : error);
  }
}
