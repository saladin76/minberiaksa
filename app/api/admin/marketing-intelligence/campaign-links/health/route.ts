import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  listCampaignLinks,
  readString,
  type CampaignLinkRecord,
} from "@/lib/marketing/campaign-links/campaign-link-registry-service";

export const dynamic = "force-dynamic";

function numberParam(request: NextRequest, key: string, fallback: number, min: number, max: number) {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;
}

function unresolvedMacros(url: string | null | undefined) {
  if (!url) return [];
  const matches = url.match(/\{[^}]+\}|\[\[[^\]]+\]\]|%7B[^%]+%7D/gi);
  return [...new Set(matches ?? [])];
}

function hasUnsafeSpaces(url: string | null | undefined) {
  return Boolean(url && /\s/.test(url));
}

function validUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function evaluate(link: CampaignLinkRecord, duplicateCount: number) {
  const warnings: string[] = [];
  const fixes: string[] = [];
  let score = 100;

  const url = readString(link.url);
  const macros = unresolvedMacros(url);
  if (!url) {
    score -= 35;
    warnings.push("missing_url");
    fixes.push("أضف الرابط الكامل للحملة.");
  } else if (!validUrl(url)) {
    score -= 25;
    warnings.push("invalid_url");
    fixes.push("تأكد أن الرابط يبدأ بـ http أو https وأنه صالح.");
  }

  if (hasUnsafeSpaces(url)) {
    score -= 10;
    warnings.push("url_contains_spaces");
    fixes.push("أزل المسافات من الرابط أو استخدم encoding صحيح.");
  }

  if (macros.length > 0) {
    score -= 20;
    warnings.push("unresolved_macros");
    fixes.push("راجع macros غير المحلولة داخل الرابط قبل استخدامه في الإعلان.");
  }

  if (!readString(link.platform)) {
    score -= 15;
    warnings.push("missing_platform");
    fixes.push("حدد المنصة مثل META أو GOOGLE_ADS أو TIKTOK.");
  }

  if (!readString(link.utmSource)) {
    score -= 8;
    warnings.push("missing_utm_source");
    fixes.push("أضف utm_source لتحديد مصدر الزيارة.");
  }
  if (!readString(link.utmMedium)) {
    score -= 8;
    warnings.push("missing_utm_medium");
    fixes.push("أضف utm_medium مثل paid_social أو cpc.");
  }
  if (!readString(link.utmCampaign)) {
    score -= 12;
    warnings.push("missing_utm_campaign");
    fixes.push("أضف utm_campaign حتى يظهر اسم الحملة في التقارير.");
  }

  if (!readString(link.campaignId) && !readString(link.utmId)) {
    score -= 12;
    warnings.push("missing_campaign_identifier");
    fixes.push("أضف campaign_id أو utm_id لتحسين المطابقة مع بيانات المنصة.");
  }

  if (!readString(link.adId) && !readString(link.adsetId) && !readString(link.adGroupId)) {
    score -= 8;
    warnings.push("missing_ad_identifiers");
    fixes.push("أضف ad_id أو adset_id/ad_group_id عندما يكون الرابط خاصًا بإعلان أو مجموعة.");
  }

  if (!readString(link.targetCountry)) {
    score -= 4;
    warnings.push("missing_target_country");
    fixes.push("أضف target_country عند الحملات الموجهة لدولة محددة.");
  }

  if (duplicateCount > 1) {
    score -= 10;
    warnings.push("duplicate_url");
    fixes.push("يوجد أكثر من سجل لنفس الرابط؛ راجع التكرار حتى لا تختلط التقارير.");
  }

  score = Math.max(0, Math.min(100, score));
  const status = score >= 85 ? "healthy" : score >= 65 ? "needs_review" : "poor";
  return { score, status, warnings, fixes: [...new Set(fixes)], unresolvedMacros: macros };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const limit = numberParam(request, "limit", 100, 1, 500);
  const platform = readString(request.nextUrl.searchParams.get("platform"));
  const links = await listCampaignLinks({ limit, platform: platform?.toUpperCase() === "ALL" ? null : platform, status: "ALL" });

  const urlCounts = new Map<string, number>();
  for (const link of links) {
    const url = readString(link.url);
    if (!url) continue;
    urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
  }

  const rows = links.map((link) => {
    const url = readString(link.url);
    const health = evaluate(link, url ? (urlCounts.get(url) || 0) : 0);
    return {
      id: link.id,
      name: link.name || link.utmCampaign || link.campaignId || "Marketing link",
      platform: link.platform || null,
      channel: link.channel || null,
      url: link.url || null,
      createdAt: link.createdAt || null,
      identifiers: {
        utmSource: link.utmSource || null,
        utmMedium: link.utmMedium || null,
        utmCampaign: link.utmCampaign || null,
        utmId: link.utmId || null,
        campaignId: link.campaignId || null,
        adsetId: link.adsetId || link.adGroupId || null,
        adId: link.adId || null,
        targetCountry: link.targetCountry || null,
      },
      health,
    };
  }).sort((a, b) => a.health.score - b.health.score);

  return NextResponse.json({
    ok: true,
    platform: platform?.toUpperCase() ?? "ALL",
    summary: {
      links: rows.length,
      healthy: rows.filter((row) => row.health.status === "healthy").length,
      needsReview: rows.filter((row) => row.health.status === "needs_review").length,
      poor: rows.filter((row) => row.health.status === "poor").length,
      averageScore: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.health.score, 0) / rows.length) : 100,
    },
    links: rows,
  }, { headers: { "Cache-Control": "no-store" } });
}
