import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { fetchAdsDonations } from "@/lib/admin/ads-fetch";
import { prisma } from "@/lib/prisma";
import { resolveAttribution } from "@/lib/tracking/attribution-resolver";
import {
  PLATFORM_LABEL_AR,
  type AdPlatform,
} from "@/lib/attribution/detect-source";

interface PlatformRow {
  platform: AdPlatform;
  platformLabel: string;
  newDonors: number;
  returningDonors: number;
  newDonorRevenue: number;
  returningRevenue: number;
  avgFirstDonation: number;
  campaignCount: number;
}

interface FirstTouchEntityRow {
  key: string;
  label: string;
  platform: AdPlatform;
  platformLabel: string;
  newDonors: number;
  newDonorRevenue: number;
  /** Total lifetime revenue across all donations by donors whose first-touch was this entity. */
  lifetimeRevenueUSD: number;
  /** Number of times those donors donated again (post-first). */
  repeatDonationCount: number;
  /** repeatDonationCount / newDonors — how often a first-time donor came back. */
  repeatDonationRate: number;
  /** Same donor base sliced to donations that happened AFTER the first donation. */
  returningRevenueUSD: number;
}

const donationAmount = (d: {
  amountUSD: number | null;
  totalAmount: number | null;
  amount: number | null;
}) => Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0);

/**
 * Per-platform new-vs-returning donor analysis + first-touch breakdowns by
 * campaign and ad. For donors whose first-ever donation falls in window, we
 * fetch their lifetime donations to estimate LTV-by-first-ad and the repeat
 * donation rate.
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

    interface MutableAcq {
      platform: AdPlatform;
      newDonorSet: Set<string>;
      returningDonorSet: Set<string>;
      newDonorRevenue: number;
      returningRevenue: number;
      newDonorAmountSum: number;
      newDonorCount: number;
      campaignSet: Set<string>;
    }
    const map = new Map<AdPlatform, MutableAcq>();
    const get = (p: AdPlatform): MutableAcq => {
      let m = map.get(p);
      if (!m) {
        m = {
          platform: p,
          newDonorSet: new Set(),
          returningDonorSet: new Set(),
          newDonorRevenue: 0,
          returningRevenue: 0,
          newDonorAmountSum: 0,
          newDonorCount: 0,
          campaignSet: new Set(),
        };
        map.set(p, m);
      }
      return m;
    };

    let totalNewDonors = 0;
    let totalReturningDonors = 0;
    let totalNewDonorRevenue = 0;
    let totalReturningRevenue = 0;

    interface FirstTouch {
      donorId: string;
      platform: AdPlatform;
      campaignKey: string | null;
      campaignLabel: string | null;
      adKey: string | null;
      adLabel: string | null;
      firstDonationUSD: number;
    }
    const firstTouches: FirstTouch[] = [];

    for (const d of donations) {
      if (d.status !== "PAID" || !d.paidAt) continue;
      const source = resolveAttribution({
        attribution: d.attribution,
        conversionEventsSentAt: d.conversionEventsSentAt,
        conversionFailedEventsSentAt: d.conversionFailedEventsSentAt,
        status: d.status,
      });
      const row = get(source.platform);
      const amount = donationAmount(d);
      if (d.isFirstEverDonation) {
        if (!row.newDonorSet.has(d.donorId)) {
          row.newDonorSet.add(d.donorId);
          totalNewDonors += 1;
        }
        row.newDonorRevenue += amount;
        row.newDonorAmountSum += amount;
        row.newDonorCount += 1;
        totalNewDonorRevenue += amount;
        if (source.campaignName) row.campaignSet.add(source.campaignName);

        firstTouches.push({
          donorId: d.donorId,
          platform: source.platform,
          campaignKey: source.campaignId ?? source.campaignName,
          campaignLabel: source.campaignName ?? source.campaignId,
          adKey: source.adId,
          adLabel:
            (typeof d.attribution === "object" &&
              d.attribution &&
              ((d.attribution as Record<string, unknown>)["ad_name"] as
                | string
                | undefined)) ||
            (typeof d.attribution === "object" &&
              d.attribution &&
              ((d.attribution as Record<string, unknown>)["utm_content"] as
                | string
                | undefined)) ||
            source.adId,
          firstDonationUSD: amount,
        });
      } else {
        if (!row.returningDonorSet.has(d.donorId)) {
          row.returningDonorSet.add(d.donorId);
          totalReturningDonors += 1;
        }
        row.returningRevenue += amount;
        totalReturningRevenue += amount;
      }
    }

    const rows: PlatformRow[] = [];
    for (const r of map.values()) {
      const avgFirst = r.newDonorCount > 0 ? r.newDonorAmountSum / r.newDonorCount : 0;
      rows.push({
        platform: r.platform,
        platformLabel: PLATFORM_LABEL_AR[r.platform],
        newDonors: r.newDonorSet.size,
        returningDonors: r.returningDonorSet.size,
        newDonorRevenue: Math.round(r.newDonorRevenue * 100) / 100,
        returningRevenue: Math.round(r.returningRevenue * 100) / 100,
        avgFirstDonation: Math.round(avgFirst * 100) / 100,
        campaignCount: r.campaignSet.size,
      });
    }
    rows.sort(
      (a, b) =>
        b.newDonorRevenue + b.returningRevenue - (a.newDonorRevenue + a.returningRevenue)
    );

    // ── First-touch by campaign + ad — including LTV/repeat-rate from lifetime donations.
    const firstTouchByCampaign: Map<string, FirstTouchEntityRow & { _donorIds: Set<string> }> = new Map();
    const firstTouchByAd: Map<string, FirstTouchEntityRow & { _donorIds: Set<string> }> = new Map();

    const initEntity = (key: string, label: string, platform: AdPlatform) => ({
      key,
      label,
      platform,
      platformLabel: PLATFORM_LABEL_AR[platform],
      newDonors: 0,
      newDonorRevenue: 0,
      lifetimeRevenueUSD: 0,
      repeatDonationCount: 0,
      repeatDonationRate: 0,
      returningRevenueUSD: 0,
      _donorIds: new Set<string>(),
    });

    for (const ft of firstTouches) {
      if (ft.campaignKey) {
        const e = firstTouchByCampaign.get(ft.campaignKey) ??
          initEntity(ft.campaignKey, ft.campaignLabel ?? ft.campaignKey, ft.platform);
        firstTouchByCampaign.set(ft.campaignKey, e);
        e._donorIds.add(ft.donorId);
        e.newDonors = e._donorIds.size;
        e.newDonorRevenue += ft.firstDonationUSD;
      }
      if (ft.adKey) {
        const e = firstTouchByAd.get(ft.adKey) ??
          initEntity(ft.adKey, ft.adLabel ?? ft.adKey, ft.platform);
        firstTouchByAd.set(ft.adKey, e);
        e._donorIds.add(ft.donorId);
        e.newDonors = e._donorIds.size;
        e.newDonorRevenue += ft.firstDonationUSD;
      }
    }

    // Fetch lifetime donations for every donor who first-touched in window.
    const donorIds = Array.from(new Set(firstTouches.map((f) => f.donorId)));
    if (donorIds.length > 0) {
      const lifetime = await prisma.donation.findMany({
        where: {
          donorId: { in: donorIds },
          status: "PAID",
          paidAt: { not: null },
        },
        select: {
          donorId: true,
          paidAt: true,
          amountUSD: true,
          totalAmount: true,
          amount: true,
        },
      });
      // Group lifetime donations per donor — sum revenue + count.
      const donorLifetime = new Map<
        string,
        { totalUSD: number; donationCount: number; firstPaidAt: number | null }
      >();
      for (const ld of lifetime) {
        const amt = donationAmount(ld);
        const prev = donorLifetime.get(ld.donorId) ?? {
          totalUSD: 0,
          donationCount: 0,
          firstPaidAt: null,
        };
        prev.totalUSD += amt;
        prev.donationCount += 1;
        const t = ld.paidAt ? ld.paidAt.getTime() : null;
        if (t != null && (prev.firstPaidAt == null || t < prev.firstPaidAt)) {
          prev.firstPaidAt = t;
        }
        donorLifetime.set(ld.donorId, prev);
      }

      const distributeLifetime = (
        bucket: Map<string, FirstTouchEntityRow & { _donorIds: Set<string> }>
      ) => {
        for (const e of bucket.values()) {
          for (const donorId of e._donorIds) {
            const lt = donorLifetime.get(donorId);
            if (!lt) continue;
            e.lifetimeRevenueUSD += lt.totalUSD;
            if (lt.donationCount > 1) {
              e.repeatDonationCount += lt.donationCount - 1;
              // returningRevenueUSD = lifetime - firstDonation (best-effort)
              // We use total minus the in-window first donation captured earlier
              // for this donor; that's correct when the donor's first-ever is
              // indeed in window.
            }
          }
          e.returningRevenueUSD = Math.max(0, e.lifetimeRevenueUSD - e.newDonorRevenue);
          e.repeatDonationRate =
            e.newDonors > 0 ? e.repeatDonationCount / e.newDonors : 0;
          // Round numeric fields.
          e.newDonorRevenue = Math.round(e.newDonorRevenue * 100) / 100;
          e.lifetimeRevenueUSD = Math.round(e.lifetimeRevenueUSD * 100) / 100;
          e.returningRevenueUSD = Math.round(e.returningRevenueUSD * 100) / 100;
          e.repeatDonationRate = Math.round(e.repeatDonationRate * 10000) / 10000;
        }
      };
      distributeLifetime(firstTouchByCampaign);
      distributeLifetime(firstTouchByAd);
    }

    const stripPrivate = (
      map: Map<string, FirstTouchEntityRow & { _donorIds: Set<string> }>
    ): FirstTouchEntityRow[] => {
      const out: FirstTouchEntityRow[] = [];
      for (const v of map.values()) {
        const { _donorIds, ...rest } = v;
        void _donorIds;
        out.push(rest);
      }
      out.sort((a, b) => b.lifetimeRevenueUSD - a.lifetimeRevenueUSD);
      return out;
    };

    return NextResponse.json({
      rows,
      totals: {
        newDonors: totalNewDonors,
        returningDonors: totalReturningDonors,
        newDonorRevenue: Math.round(totalNewDonorRevenue * 100) / 100,
        returningRevenue: Math.round(totalReturningRevenue * 100) / 100,
      },
      firstTouch: {
        byCampaign: stripPrivate(firstTouchByCampaign).slice(0, 50),
        byAd: stripPrivate(firstTouchByAd).slice(0, 50),
      },
      range: {
        startDateKey: range.startDateKey,
        endDateKey: range.endDateKey,
      },
    });
  } catch (error) {
    console.error("Error fetching ads acquisition:", error);
    return NextResponse.json(
      { error: "Failed to fetch ads acquisition" },
      { status: 500 }
    );
  }
}
