import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookChallenge, verifyWebhookSignature, parseWebhookPayload, templateLifecycleWebhookWabaIds } from "@/lib/communication/providers/meta-whatsapp/webhooks";
import { processWhatsappEvents } from "@/lib/communication/webhook-service";
import { syncMetaWhatsappTemplates } from "@/lib/communication/whatsapp-template-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const challenge = await verifyWebhookChallenge(sp.get("hub.mode"), sp.get("hub.verify_token"), sp.get("hub.challenge"));
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const verdict = await verifyWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"));
  if (verdict === "invalid") return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  if (verdict === "error") return NextResponse.json({ ok: false, error: "signature verification unavailable" }, { status: 503 });
  if (verdict === "unconfigured" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "signature verification not configured" }, { status: 401 });
  }
  /* 200 means "stored". Meta retries a non-2xx for up to 24 hours, which is exactly the behaviour we
     want when the archive write failed  and exactly what a blanket 200 threw away: a delivery
     receipt or a donor's reply lost to a transient database error was never sent again. A malformed
     body is still acknowledged, because a retry of something unparseable would only repeat. */
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable body" }, { status: 200 });
  }
  try {
    const summary = await processWhatsappEvents(parseWebhookPayload(payload));
    if (summary.persistenceErrors > 0) {
      return NextResponse.json({ ok: false, error: "events not persisted", summary }, { status: 503 });
    }

    // Template status/quality changes are not delivery events. Reconcile the affected WABA
    // immediately so a PAUSED/DISABLED template stops being considered sendable without waiting
    // for the 15-minute safety reconciliation cron.
    const templateWabas = templateLifecycleWebhookWabaIds(payload);
    const templateSync = [];
    for (const businessAccountId of templateWabas) {
      const synced = await syncMetaWhatsappTemplates({
        businessAccountId,
        actor: { actorRole: "SYSTEM" },
      });
      templateSync.push({ businessAccountId, ok: synced.ok, reason: synced.reason ?? null });
      if (!synced.ok) {
        return NextResponse.json(
          { ok: false, error: "template state not reconciled", summary, templateSync },
          { status: 503 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      summary,
      templateSync,
      signatureVerified: verdict === "valid",
    }, { status: 200 });
  } catch (error) {
    console.error("meta whatsapp webhook processing threw", error);
    return NextResponse.json({ ok: false, error: "processing failed" }, { status: 503 });
  }
}
