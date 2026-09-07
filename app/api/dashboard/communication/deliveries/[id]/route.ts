import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { RETRYABLE_STATUSES, NON_RETRYABLE_TERMINAL } from "@/lib/communication/communication-runtime-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One delivery, in full — what the معاينة sheet reads.
 *
 * Deliberately its own endpoint rather than extra columns on the channel list: `renderedBody` holds
 * a complete email HTML document, so folding it into the paged table would multiply that page's
 * payload by twenty-five to serve content the reader has not asked to see yet.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "messages");
    if (denied) return denied;

    const { id } = await params;
    const row = await prisma.communicationDelivery.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ ok: false, error: "لم يُعثر على الرسالة" }, { status: 404 });

    // The retry that superseded this attempt, when there is one. Showing it turns a stale-looking
    // FAILED row into "failed, then re-sent successfully" — otherwise the reader has to guess.
    const retry = row.retriedAt
      ? await prisma.communicationDelivery.findFirst({
          where: { retryOfDeliveryId: id },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, sentAt: true, errorMessage: true, createdAt: true },
        })
      : null;

    const retryable =
      (RETRYABLE_STATUSES as readonly string[]).includes(row.status) && !row.retriedAt;

    return NextResponse.json({
      ok: true,
      item: row,
      retry,
      retryable,
      /** Why the retry button is unavailable, when it is. Null when the row can be re-sent. */
      retryBlockedReason: retryable
        ? null
        : (NON_RETRYABLE_TERMINAL as readonly string[]).includes(row.status)
          ? "العنوان مرتدّ — إعادة الإرسال إليه تضرّ بسمعة النطاق."
          : row.retriedAt
            ? "أُعيد إرسال هذه الرسالة من قبل."
            : "هذه الرسالة ليست في حالة فشل أو تخطٍّ.",
    });
  } catch (error) {
    console.error("communication delivery detail failed", error);
    return NextResponse.json({ ok: false, error: "تعذّر تحميل الرسالة" }, { status: 500 });
  }
}
