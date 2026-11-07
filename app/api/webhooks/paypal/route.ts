import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPayPalWebhook } from "@/lib/paypal";
import { reconcilePayPalWebhookOrder } from "@/lib/donations/paypal-donation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length")) > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let event: { event_type?: string; resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.event_type !== "string") return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  try {
    const settings = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { paypalWebhookId: true } });
    const webhookId = process.env.PAYPAL_WEBHOOK_ID || settings?.paypalWebhookId;
    if (!webhookId) return NextResponse.json({ error: "PAYPAL_WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
    if (!await verifyPayPalWebhook(request.headers, event, webhookId)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    const types = ["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.DENIED"];
    if (!types.includes(event.event_type ?? "")) return NextResponse.json({ ok: true, ignored: true });
    const orderId = event.event_type === "CHECKOUT.ORDER.APPROVED" ? event.resource?.id : event.resource?.supplementary_data?.related_ids?.order_id;
    if (!orderId || !/^[A-Z0-9]{8,32}$/i.test(orderId)) return NextResponse.json({ ok: true, ignored: true });
    // Always read the actual order. The event payload is never itself proof
    // of amount, currency, merchant/order ownership or completed collection.
    const outcome = await reconcilePayPalWebhookOrder(orderId);
    return NextResponse.json({ ok: true, outcome });
  } catch {
    // PayPal retries non-2xx deliveries. Do not acknowledge work that failed,
    // and never print private provider bodies or credentials.
    return NextResponse.json({ error: "PayPal confirmation unavailable" }, { status: 502 });
  }
}
