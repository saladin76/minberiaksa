import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * LEGACY ROUTE — DISABLED.
 *
 * This route previously sent WhatsApp through the legacy Twilio path (`lib/whatsapp.ts`) and wrote
 * only `SentMessage`. WhatsApp sending has moved to the Communication Center (Meta WhatsApp Cloud API
 * via ProviderRouter + CommunicationDelivery). This endpoint no longer imports `sendBulkWhatsapp`,
 * never touches Twilio, and cannot send anything — it returns 410 Gone so nothing sends by accident.
 *
 * It used to point callers at /dashboard/operations/communication, which was removed with التشغيل.
 * There is no replacement UI for manual WhatsApp sending, so no `redirectTo` is offered — sending a
 * client to a 404 is worse than telling it plainly that the capability is gone.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "WHATSAPP_LEGACY_ROUTE_DISABLED",
      messageAr: "إرسال واتساب من هذا المسار لم يعد متاحًا.",
    },
    { status: 410 }
  );
}
