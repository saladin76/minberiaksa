import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession } from "@/lib/audit-log";
import { verifyWhatsappSender } from "@/lib/communication/sender-service";
import { verificationErrorBody } from "@/lib/communication/sender-verification";
import { publicSender } from "@/lib/communication/public-sender";

/**
 * Verify one WhatsApp sender against Meta. A failure keeps `error` (the message existing callers
 * show) and adds `stage`, `reason`, `detail` and `retryable` so the dashboard can say where it
 * failed and whether retrying makes sense. Nothing secret reaches this body: details come from
 * `mapGraphError`, which scrubs tokens.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const { id } = await params;

  try {
    const result = await verifyWhatsappSender(id, auditActorFromDashboardSession(session!));
    if (!result.ok) return NextResponse.json(verificationErrorBody(result.error, result.diagnostic), { status: result.status });
    return NextResponse.json({
      ok: true,
      sender: publicSender(result.data),
      message: result.message ?? null,
      warnings: result.warnings ?? [],
    });
  } catch (error) {
    console.error("WhatsApp sender Meta verification route failed", { senderId: id, error });
    return NextResponse.json(
      { error: "تعذّر إكمال التحقق أو تسجيل نتيجته. حدّث الصفحة وافحص حالة المُرسِل قبل إعادة المحاولة." },
      { status: 500 },
    );
  }
}
