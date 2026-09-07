import { NextRequest, NextResponse } from "next/server";
import { webhookTokenMatches } from "@/lib/integration-settings/provider-webhook";
import { getActiveElasticEmailWebhookSecret } from "@/lib/communication/runtime-config";
import { normalizeElasticEmailEvents } from "@/lib/communication/providers/elastic-email/webhook-events";
import { processElasticEmailEvents } from "@/lib/communication/email-webhook-service";

/**
 * Elastic Email HTTP event notifications (delivered / opened / clicked / bounced / unsubscribed).
 * Protected by the `?token=` query secret generated in the integration settings page. Always answers
 * 200 for authenticated calls so Elastic Email does not retry a payload we cannot parse.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = await getActiveElasticEmailWebhookSecret();
  const isProduction = process.env.NODE_ENV === "production";
  if (!secret.configured) {
    // No secret configured yet: reject in production, allow locally so setup can be exercised.
    if (isProduction) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  } else if (!webhookTokenMatches(req.nextUrl.searchParams.get("token"), secret.values.secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json().catch(() => null);
    const events = normalizeElasticEmailEvents(payload);
    if (!events.length) return NextResponse.json({ ok: true, received: 0 }, { status: 200 });
    const summary = await processElasticEmailEvents(events);
    return NextResponse.json({ ok: true, ...summary }, { status: 200 });
  } catch (error) {
    console.error("elastic-email webhook failed", error);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

export async function GET() {
  const secret = await getActiveElasticEmailWebhookSecret();
  return NextResponse.json({ ok: true, provider: "elastic-email", webhookProtected: secret.configured }, { status: 200 });
}
