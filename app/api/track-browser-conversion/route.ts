import { NextRequest, NextResponse } from "next/server";
import { recordConversionEvent, type ConversionChannel, type ConversionPlatform } from "@/lib/tracking/conversion-event-log";

export const dynamic = "force-dynamic";

/**
 * This endpoint is called from the browser, so its body is attacker-controlled: `platform` and
 * `channel` were passed straight through to a typed column with `|| "META"` as the only check, which
 * accepted any string at all. Anything unrecognised is now recorded under the safe default rather
 * than written as a platform the rest of the system cannot interpret.
 */
const PLATFORMS: readonly ConversionPlatform[] = ["META", "GA4", "GOOGLE_ADS", "TIKTOK", "X", "VERCEL"];

function platformFrom(value: unknown): ConversionPlatform {
  return PLATFORMS.includes(value as ConversionPlatform) ? (value as ConversionPlatform) : "META";
}

function channelFrom(value: unknown): ConversionChannel {
  return value === "server" ? "server" : "browser";
}

function statusFrom(value: unknown) {
  if (value === "SENT" || value === "SKIPPED" || value === "FAILED") return value;
  return "PENDING";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as null | {
    donationId?: string;
    eventId?: string;
    eventName?: string;
    platform?: string;
    channel?: string;
    status?: unknown;
    value?: number;
    currency?: string;
    error?: string | null;
    response?: unknown;
  };

  const donationId = body?.donationId?.trim();
  const eventId = body?.eventId?.trim();
  if (!donationId || !eventId) {
    return NextResponse.json({ ok: false, error: "missing donationId or eventId" }, { status: 400 });
  }

  await recordConversionEvent({
    donationId,
    eventId,
    eventName: body?.eventName || "Donate",
    platform: platformFrom(body?.platform),
    channel: channelFrom(body?.channel),
    status: statusFrom(body?.status),
    value: typeof body?.value === "number" ? body.value : undefined,
    currency: body?.currency,
    /* `attempts` is not part of RecordConversionEventInput  the log increments it itself with `$inc`,
       so this was silently dropped. */
    error: body?.error || null,
    request: { source: "browser", userAgent: request.headers.get("user-agent") },
    response: body?.response ?? null,
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
