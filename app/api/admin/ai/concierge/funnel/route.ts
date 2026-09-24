import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { CONCIERGE_EVENTS } from "@/lib/ai/concierge/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai/concierge/funnel?days=30
 *
 * The concierge's business numbers, computed from `AiConciergeEvent` and the
 * paid donations that carry `attribution.ai_concierge`: sessions per funnel
 * step, intents, most-selected campaigns, and concierge-assisted revenue.
 * Same permission as the marketing intelligence pages (`ads`).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 30) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await prisma.aiConciergeEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { sessionId: true, event: true, intent: true, campaignId: true, amountUSD: true, frequency: true, mode: true, locale: true, donationId: true },
  });

  const sessionsByEvent = new Map<string, Set<string>>();
  const intents = new Map<string, Set<string>>();
  const campaigns = new Map<string, number>();
  const locales = new Map<string, Set<string>>();
  let modelTurns = 0;
  let fallbackTurns = 0;
  for (const e of events) {
    if (!sessionsByEvent.has(e.event)) sessionsByEvent.set(e.event, new Set());
    sessionsByEvent.get(e.event)!.add(e.sessionId);
    if (e.event === "intent_selected" && e.intent) {
      if (!intents.has(e.intent)) intents.set(e.intent, new Set());
      intents.get(e.intent)!.add(e.sessionId);
    }
    if (e.event === "campaign_selected" && e.campaignId) campaigns.set(e.campaignId, (campaigns.get(e.campaignId) ?? 0) + 1);
    if (e.event === "message_sent") {
      if (e.mode === "llm") modelTurns += 1;
      else fallbackTurns += 1;
    }
    if (!locales.has(e.locale)) locales.set(e.locale, new Set());
    locales.get(e.locale)!.add(e.sessionId);
  }

  /* Paid donations whose basket went through the concierge. `attribution` is
     JSON, so the filter is on the marker's presence. */
  const paid = await prisma.donation.findMany({
    where: { createdAt: { gte: since }, status: "PAID", paidAt: { not: null }, attribution: { not: null as never } },
    select: { id: true, amountUSD: true, totalAmount: true, currency: true, attribution: true },
  });
  const assisted = paid.filter((d) => {
    const a = d.attribution as { ai_concierge?: { sessionId?: string } } | null;
    return Boolean(a?.ai_concierge?.sessionId);
  });
  const assistedSessions = new Set(assisted.map((d) => (d.attribution as { ai_concierge: { sessionId: string } }).ai_concierge.sessionId));
  const assistedUsd = assisted.reduce((s, d) => s + (d.amountUSD ?? 0), 0);

  const opened = sessionsByEvent.get("assistant_opened")?.size ?? 0;
  const step = (name: string) => sessionsByEvent.get(name)?.size ?? 0;
  const interacted = new Set<string>();
  for (const name of ["intent_selected", "message_sent"]) for (const id of sessionsByEvent.get(name) ?? []) interacted.add(id);

  const campaignTitles = campaigns.size
    ? await prisma.campaign.findMany({ where: { id: { in: [...campaigns.keys()] } }, select: { id: true, title: true } })
    : [];
  const titleOf = new Map(campaignTitles.map((c) => [c.id, c.title]));

  return NextResponse.json(
    {
      days,
      since: since.toISOString(),
      funnel: {
        opened,
        interacted: interacted.size,
        recommendationShown: step("recommendation_shown"),
        campaignSelected: step("campaign_selected"),
        donationConfigured: step("donation_configured"),
        addedToCart: step("donation_added_to_cart"),
        checkoutStarted: step("checkout_started"),
        orderCreated: step("order_created"),
        donationCompleted: assistedSessions.size,
      },
      rates: {
        openToInteract: opened ? interacted.size / opened : 0,
        openToAddToCart: opened ? step("donation_added_to_cart") / opened : 0,
        openToPaid: opened ? assistedSessions.size / opened : 0,
        addToCartToPaid: step("donation_added_to_cart") ? assistedSessions.size / step("donation_added_to_cart") : 0,
      },
      assisted: { paidDonations: assisted.length, sessions: assistedSessions.size, totalUSD: Math.round(assistedUsd * 100) / 100, averageUSD: assisted.length ? Math.round((assistedUsd / assisted.length) * 100) / 100 : 0 },
      intents: [...intents.entries()].map(([intent, s]) => ({ intent, sessions: s.size })).sort((a, b) => b.sessions - a.sessions),
      topCampaigns: [...campaigns.entries()].map(([id, count]) => ({ id, title: titleOf.get(id) ?? id, selections: count })).sort((a, b) => b.selections - a.selections).slice(0, 15),
      locales: [...locales.entries()].map(([locale, s]) => ({ locale, sessions: s.size })).sort((a, b) => b.sessions - a.sessions),
      model: { turns: modelTurns, fallbackTurns },
      events: CONCIERGE_EVENTS.map((name) => ({ event: name, sessions: step(name) })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
