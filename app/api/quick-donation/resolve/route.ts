import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { parseQuickDonation, quickDonationCampaignId } from "@/lib/minbar/quick-donation";

/** Recheck the current approved destination immediately before creating a cart line. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (typeof body?.destination !== "string") return NextResponse.json({ error: "INVALID_DESTINATION" }, { status: 400 });
    const settings = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { quickDonation: true } });
    const config = parseQuickDonation(settings?.quickDonation);
    const id = config.enabled ? quickDonationCampaignId(config, body.destination) : null;
    if (!id) return NextResponse.json({ error: "UNAPPROVED_DESTINATION" }, { status: 422 });
    const campaign = await prisma.campaign.findFirst({ where: { id, isActive: true, AND: [NOT_SOFT_DELETED] }, select: { id: true } });
    if (!campaign) return NextResponse.json({ error: "DESTINATION_UNAVAILABLE" }, { status: 422 });
    return NextResponse.json({ projectId: campaign.id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "DESTINATION_CHECK_UNAVAILABLE" }, { status: 503 });
  }
}
