import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookChallenge, verifyWebhookSignature, parseWebhookPayload } from "@/lib/communication/providers/meta-whatsapp/webhooks";
import { processWhatsappEvents } from "@/lib/communication/webhook-service";

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
  try {
    const payload = JSON.parse(rawBody);
    const summary = await processWhatsappEvents(parseWebhookPayload(payload));
    return NextResponse.json({ ok: true, summary, signatureVerified: verdict === "valid" }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
