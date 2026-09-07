import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  detectDonationSource,
  PLATFORM_LABEL_AR,
  STATUS_LABEL_AR,
} from "@/lib/attribution/detect-source";

/**
 * GET /api/admin/donors/[id]/attribution-journey
 *
 * Returns the donor's donations sorted oldest-first with per-donation source
 * detection, plus a "first-touch" summary derived from the earliest donation
 * whose attribution identifies a paid platform.
 *
 * Pure read — runs the same `detectDonationSource` the dashboard uses for the
 * row badge, so the journey view stays consistent with the table.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    // Donor profile already gates on the donor's permission set; we reuse the
    // `revenue` permission here (anyone with access to donations data).
    const denied = requireAdminOrDashboardPermission(session, "revenue");
    if (denied) return denied;

    const { id: donorId } = await params;
    if (!donorId) {
      return NextResponse.json({ error: "Missing donor id" }, { status: 400 });
    }

    const donations = await prisma.donation.findMany({
      where: { donorId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        paidAt: true,
        status: true,
        amountUSD: true,
        totalAmount: true,
        amount: true,
        currency: true,
        attribution: true,
        conversionEventsSentAt: true,
        conversionFailedEventsSentAt: true,
        subscriptionId: true,
        items: { select: { campaign: { select: { id: true, title: true } } } },
      },
    });

    const journey = donations.map((d) => {
      const source = detectDonationSource({
        attribution: (d.attribution as Record<string, unknown> | null | undefined) ?? null,
        conversionEventsSentAt: d.conversionEventsSentAt,
        conversionFailedEventsSentAt: d.conversionFailedEventsSentAt,
        status: d.status,
      });
      return {
        id: d.id,
        createdAt: d.createdAt.toISOString(),
        paidAt: d.paidAt ? d.paidAt.toISOString() : null,
        status: d.status,
        amountUSD: d.amountUSD ?? d.totalAmount ?? d.amount ?? 0,
        currency: d.currency,
        type: d.subscriptionId ? ("MONTHLY" as const) : ("ONE_TIME" as const),
        campaign: d.items[0]?.campaign?.title ?? null,
        platform: source.platform,
        platformLabel: PLATFORM_LABEL_AR[source.platform],
        sourceStatus: source.status,
        sourceStatusLabel: STATUS_LABEL_AR[source.status],
        confidence: source.confidence,
        adCampaign: source.campaignName,
        placement: source.placement,
      };
    });

    // First-touch: earliest *paid* donation that resolves to a non-organic
    // platform. If no donation is attributable, fall back to the earliest
    // paid donation overall, then to the earliest creation.
    const paidJourney = journey.filter((j) => j.status === "PAID" && j.paidAt);
    const firstAttributedPaid = paidJourney.find((j) => j.platform !== "organic");
    const firstTouchSource = firstAttributedPaid ?? paidJourney[0] ?? journey[0] ?? null;

    return NextResponse.json({
      donorId,
      totalDonations: journey.length,
      paidDonations: paidJourney.length,
      firstTouch: firstTouchSource,
      journey,
    });
  } catch (error) {
    console.error("Error fetching donor attribution journey:", error);
    return NextResponse.json(
      { error: "Failed to fetch donor attribution journey" },
      { status: 500 }
    );
  }
}
