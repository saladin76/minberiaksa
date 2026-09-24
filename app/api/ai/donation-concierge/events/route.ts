import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidLocale, DEFAULT_LOCALE } from "@/lib/locales";
import { CONCIERGE_EVENTS, recordConciergeEvents } from "@/lib/ai/concierge/events";
import { clientKey, hit } from "@/lib/ai/concierge/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/donation-concierge/events — the browser's half of the funnel:
 * the steps that happen after the assistant answered (a project page opened
 * from a card, the basket or checkout reached). Same vocabulary and the same
 * collection as the server-written steps, so the funnel is one query.
 */

const eventSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  locale: z.string().min(2).max(5),
  events: z
    .array(
      z.object({
        event: z.enum(CONCIERGE_EVENTS),
        route: z.string().max(40).nullable().optional(),
        intent: z.string().max(40).nullable().optional(),
        campaignId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
        categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/).nullable().optional(),
        amountUSD: z.number().positive().max(1_000_000).nullable().optional(),
        frequency: z.string().max(10).nullable().optional(),
      })
    )
    .min(1)
    .max(10),
});

export async function POST(request: NextRequest) {
  const limit = hit(clientKey(request.headers, "concierge-events"), 60, 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });
  const body = await request.json().catch(() => null);
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const locale = isValidLocale(parsed.data.locale) ? parsed.data.locale : DEFAULT_LOCALE;
  await recordConciergeEvents(parsed.data.events.map((e) => ({ ...e, sessionId: parsed.data.sessionId, locale, mode: "client" })));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
