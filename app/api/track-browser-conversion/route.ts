import { NextRequest, NextResponse } from "next/server";
import { recordConversionEvent } from "@/lib/tracking/conversion-event-log";

export const dynamic = "force-dynamic";

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
    platform: body?.platform || "META",
    channel: body?.channel || "browser",
    status: statusFrom(body?.status),
    value: typeof body?.value === "number" ? body.value : undefined,
    currency: body?.currency,
    attempts: 1,
    error: body?.error || null,
    request: { source: "browser", userAgent: request.headers.get("user-agent") },
    response: body?.response ?? null,
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
