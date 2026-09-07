import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { brevoWebhookTokenMatches } from "@/lib/integration-settings/brevo-webhook";
import { getActiveBrevoWebhookSecret } from "@/lib/communication/runtime-config";
import { shouldApplyDeliveryStatus } from "@/lib/communication/delivery-status-progress";
import { isDeliveryStatus } from "@/lib/communication/communication-runtime-types";

/**
 * Brevo delivery events. Brevo is SMS-only in the final architecture (email moved to Elastic Email),
 * so every event is mapped through the SMS status table. The route path is unchanged so existing
 * Brevo console configuration keeps working.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SMS_STATUS: Record<string, string> = {
  sent: "SENT", delivered: "DELIVERED", delivery: "DELIVERED",
  hardBounce: "FAILED", hard_bounce: "FAILED", softBounce: "FAILED", soft_bounce: "FAILED",
  rejected: "FAILED", blocked: "FAILED", error: "FAILED", unsubscribed: "UNSUBSCRIBED",
};

function timestampField(status: string): Record<string, Date> {
  const now = new Date();
  if (status === "SENT") return { sentAt: now };
  if (status === "DELIVERED") return { deliveredAt: now };
  if (status === "FAILED" || status === "UNSUBSCRIBED") return { failedAt: now };
  return {};
}

export async function POST(req: NextRequest) {
  const runtimeSecret = await getActiveBrevoWebhookSecret();
  const isProduction = process.env.NODE_ENV === "production";
  if (!runtimeSecret.configured) {
    if (isProduction) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  } else if (!brevoWebhookTokenMatches(req.nextUrl.searchParams.get("token"), runtimeSecret.values.secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: true }, { status: 200 });
  try {
    const event = String(body.event ?? "").trim();
    const messageId = String(body["message-id"] ?? body.messageId ?? "").trim();
    const status = SMS_STATUS[event];
    if (!process.env.DATABASE_URL || !messageId || !status || !isDeliveryStatus(status)) {
      return NextResponse.json({ ok: true, processed: false }, { status: 200 });
    }

    const delivery = await prisma.communicationDelivery
      .findFirst({ where: { providerMessageId: messageId }, select: { id: true, status: true } })
      .catch(() => null);
    // Out-of-order events must not downgrade a delivery that already progressed further.
    if (!delivery || !shouldApplyDeliveryStatus(delivery.status, status)) {
      return NextResponse.json({ ok: true, processed: false }, { status: 200 });
    }

    await prisma.communicationDelivery
      .update({ where: { id: delivery.id }, data: { status, ...timestampField(status) } })
      .catch(() => {});
    return NextResponse.json({ ok: true, processed: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

export async function GET() {
  const runtimeSecret = await getActiveBrevoWebhookSecret();
  return NextResponse.json({ ok: true, provider: "brevo-sms", webhookProtected: runtimeSecret.configured }, { status: 200 });
}
