import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { isValidLocale, DEFAULT_LOCALE } from "@/lib/locales";
import { conciergeRequestSchema, conciergeResponseSchema } from "@/lib/ai/concierge/schema";
import { runConcierge } from "@/lib/ai/concierge/engine";
import { recordConciergeEvents, type ConciergeEventInput, type ConciergeEventName } from "@/lib/ai/concierge/events";
import { clientKey, hit } from "@/lib/ai/concierge/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/donation-concierge — the donor-facing concierge.
 *
 * Public, unauthenticated, and deliberately narrow: the body is validated
 * against `conciergeRequestSchema`, the engine only ever reads the published
 * catalog, and the response is re-validated before it leaves. No database
 * row, price, or donor detail travels through here that the public pages do
 * not already show.
 */

const MAX_BODY_BYTES = 12_000;
const LIMIT_PER_MINUTE = 20;
const LIMIT_MODEL_PER_10_MIN = 40;

function noStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

function stepEvents(req: ReturnType<typeof conciergeRequestSchema.parse>, res: { intent: string; mode: string; blocks: Array<{ type: string }> }, route: string | null): ConciergeEventInput[] {
  const base = { sessionId: req.sessionId, locale: req.locale, route, mode: res.mode };
  const out: ConciergeEventInput[] = [];
  const push = (event: ConciergeEventName, extra: Partial<ConciergeEventInput> = {}) => out.push({ ...base, event, intent: res.intent, ...extra });
  if (req.step) {
    switch (req.step.kind) {
      case "open":
        push("assistant_opened");
        break;
      case "intent":
        push("intent_selected", { intent: req.step.intent });
        if (req.step.intent === "zakat") push("zakat_started");
        if (req.step.intent === "waqf") push("waqf_started");
        break;
      case "select_campaign":
        push("campaign_selected", { campaignId: req.step.campaignId });
        break;
      case "select_category":
        push("campaign_selected", { categoryId: req.step.categoryId });
        break;
      case "added":
        push("donation_added_to_cart", { campaignId: req.step.campaignId ?? null, categoryId: req.step.categoryId ?? null, amountUSD: req.step.amountUSD, frequency: req.step.frequency });
        if (req.step.frequency !== "once") push("recurring_selected", { frequency: req.step.frequency });
        if (req.step.gift) push("gift_selected", { campaignId: req.step.campaignId ?? null });
        break;
      case "show_more":
        break;
    }
  } else {
    push("message_sent");
    if (res.mode === "deterministic") push("model_fallback");
    if (res.intent === "zakat") push("zakat_started");
    if (res.intent === "waqf") push("waqf_started");
  }
  if (res.blocks.some((b) => b.type === "campaign_recommendations" || b.type === "category_options")) push("recommendation_shown");
  if (res.blocks.some((b) => b.type === "donation_configuration")) push("donation_configured", { campaignId: req.step?.kind === "select_campaign" ? req.step.campaignId : undefined });
  return out;
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return noStore({ error: "Payload too large" }, { status: 413 });

  const perMinute = hit(clientKey(request.headers, "concierge"), LIMIT_PER_MINUTE, 60_000);
  if (!perMinute.ok) return noStore({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(perMinute.retryAfterSeconds) } });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return noStore({ error: "Payload too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return noStore({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = conciergeRequestSchema.safeParse(body);
  if (!parsed.success) return noStore({ error: "Invalid request", issues: parsed.error.flatten().fieldErrors }, { status: 400 });

  const req = { ...parsed.data, locale: isValidLocale(parsed.data.locale) ? parsed.data.locale : DEFAULT_LOCALE };

  /* Free text costs a model call; a tighter ceiling on that alone. */
  if (req.message) {
    const model = hit(clientKey(request.headers, "concierge-model"), LIMIT_MODEL_PER_10_MIN, 10 * 60_000);
    if (!model.ok) return noStore({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(model.retryAfterSeconds) } });
  }

  try {
    /* The donor's identity comes from the session cookie alone; the body
       cannot name a user. A visitor gets the same assistant without DONOR. */
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = typeof session?.user?.id === "string" ? session.user.id : null;
    const result = await runConcierge(req, { userId });
    const valid = conciergeResponseSchema.safeParse(result);
    if (!valid.success) {
      console.error("[concierge] response failed validation", valid.error.flatten());
      return noStore({ error: "Assistant unavailable" }, { status: 502 });
    }
    void recordConciergeEvents(stepEvents(req, valid.data, req.page?.route ?? null));
    return noStore(valid.data);
  } catch (error) {
    console.error("[concierge] engine failed", error instanceof Error ? error.message : error);
    return noStore({ error: "Assistant unavailable" }, { status: 502 });
  }
}
