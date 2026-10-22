import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { sendDonationServerConversions } from "@/lib/tracking/donation-conversion-server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "Missing donation id" }, { status: 400 });

  const donation = await prisma.donation.findUnique({
    where: { id },
    select: { id: true, status: true, paidAt: true, conversionEventsSentAt: true },
  });
  if (!donation) return NextResponse.json({ ok: false, error: "Donation not found" }, { status: 404 });
  if (donation.status !== "PAID" || donation.paidAt == null) {
    return NextResponse.json({ ok: false, error: "لا يمكن إرسال Donate قبل تأكيد نجاح التبرع.", code: "DONATION_NOT_PAID" }, { status: 409 });
  }
  if (donation.conversionEventsSentAt != null) {
    return NextResponse.json({ ok: false, error: "تم إرسال حدث Donate لهذا التبرع بالفعل.", code: "DONATE_ALREADY_SENT" }, { status: 409 });
  }

  const result = await sendDonationServerConversions(id, { force: true, includeGa4: false });
  if (!result.ok) {
    const detail = result.error ?? result.reason ?? "Meta did not accept the Donate event";
    return NextResponse.json(
      { ok: false, error: detail, code: result.skipped ? "META_CAPI_RETRY_SKIPPED" : "META_CAPI_RETRY_FAILED", result },
      { status: result.skipped ? 409 : 502 },
    );
  }

  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "ads.donation.meta-capi-donate.retried",
    messageAr: `أعاد ${actor.actorName ?? "المشرف"} إرسال حدث Donate إلى Meta للتبرع ${id}`,
    messageEn: `Meta CAPI Donate retried for donation ${id}`,
    entityType: "Donation",
    entityId: id,
    metadata: { eventId: result.event_id ?? null, platform: "META", result: "SENT" },
    stream: "TEAM",
  });

  return NextResponse.json({ ok: true, donationId: id, eventId: result.event_id ?? null, result });
}
