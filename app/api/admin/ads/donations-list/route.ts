import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { fetchAdsDonations } from "@/lib/admin/ads-fetch";
import { resolveAttribution } from "@/lib/tracking/attribution-resolver";
import {
  ATTRIBUTION_STATUS_LABEL_AR,
  type AttributionStatus,
} from "@/lib/tracking/tracking-event-contract";
import {
  PLATFORM_LABEL_AR,
  type AdPlatform,
} from "@/lib/attribution/detect-source";

/**
 * Per-donation feed for the "مجموعات إعلانية" tab. Returns the raw donation
 * rows in the selected period with their full attribution snapshot — utm_term
 * (search keyword), utm_campaign, country and amount — already paired with the
 * source-detection result so the UI can render the badge inline.
 *
 * Capped at 2000 rows; tighter date filters needed beyond that.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "ads");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const { donations, range } = await fetchAdsDonations({
      period: sp.get("period") || "month",
      startParam: sp.get("start"),
      endParam: sp.get("end"),
      categoryId: sp.get("categoryId"),
      campaignId: sp.get("campaignId"),
      country: sp.get("country"),
    });

    const pick = (attr: Record<string, unknown> | null, k: string): string | null => {
      if (!attr) return null;
      const v = attr[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
      return null;
    };

    interface OutRow {
      id: string;
      createdAt: string;
      paidAt: string | null;
      status: string;
      amount: number;
      amountUSD: number;
      currency: string;
      donorCountryCode: string | null;
      utmCampaign: string | null;
      utmTerm: string | null;
      utmContent: string | null;
      utmSource: string | null;
      utmMedium: string | null;
      placement: string | null;
      adsetId: string | null;
      adId: string | null;
      campaignId: string | null;
      campaignName: string | null;
      adName: string | null;
      platform: AdPlatform;
      platformLabel: string;
      sourceStatus: AttributionStatus;
      sourceStatusLabel: string;
      confidence: number;
      warningCount: number;
    }

    const rows: OutRow[] = donations.map((d) => {
      const src = resolveAttribution({
        attribution: d.attribution,
        conversionEventsSentAt: d.conversionEventsSentAt,
        conversionFailedEventsSentAt: d.conversionFailedEventsSentAt,
        status: d.status,
      });
      return {
        id: d.id,
        createdAt: d.createdAt.toISOString(),
        paidAt: d.paidAt ? d.paidAt.toISOString() : null,
        status: d.status,
        amount: Number(d.totalAmount ?? d.amount ?? 0),
        amountUSD: Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0),
        currency: d.currency,
        donorCountryCode: d.donorCountryCode,
        utmCampaign: pick(d.attribution, "utm_campaign") ?? src.campaignName,
        utmTerm: pick(d.attribution, "utm_term"),
        utmContent: pick(d.attribution, "utm_content"),
        utmSource: pick(d.attribution, "utm_source"),
        utmMedium: pick(d.attribution, "utm_medium"),
        placement: pick(d.attribution, "placement") ?? src.placement,
        adsetId:
          pick(d.attribution, "adset_id") ??
          pick(d.attribution, "ad_group_id") ??
          src.adsetId,
        adId: pick(d.attribution, "ad_id") ?? src.adId,
        campaignId: src.campaignId,
        campaignName: src.campaignName,
        adName:
          pick(d.attribution, "ad_name") ??
          pick(d.attribution, "utm_content") ??
          null,
        platform: src.platform,
        platformLabel: PLATFORM_LABEL_AR[src.platform],
        sourceStatus: src.status,
        sourceStatusLabel: ATTRIBUTION_STATUS_LABEL_AR[src.status],
        confidence: src.confidence,
        warningCount: src.warnings.length,
      };
    });

    rows.sort((a, b) => {
      const at = a.paidAt ? Date.parse(a.paidAt) : Date.parse(a.createdAt);
      const bt = b.paidAt ? Date.parse(b.paidAt) : Date.parse(b.createdAt);
      return bt - at;
    });

    const CAP = 2000;
    const truncated = rows.length > CAP;
    return NextResponse.json({
      rows: truncated ? rows.slice(0, CAP) : rows,
      totalRows: rows.length,
      truncated,
      range: {
        startDateKey: range.startDateKey,
        endDateKey: range.endDateKey,
      },
    });
  } catch (error) {
    console.error("Error fetching ads donations list:", error);
    return NextResponse.json(
      { error: "Failed to fetch ads donations list" },
      { status: 500 }
    );
  }
}
