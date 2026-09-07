import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveAttribution } from "@/lib/tracking/attribution-resolver";
import {
  ATTRIBUTION_STATUS_LABEL_AR,
} from "@/lib/tracking/tracking-event-contract";
import { PLATFORM_LABEL_AR } from "@/lib/attribution/detect-source";
import { stableDonateEventId } from "@/lib/tracking/stable-event-id";

const UTM_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "ad_group_id",
  "adset_name",
  "ad_group_name",
  "ad_id",
  "ad_name",
  "placement",
  "platform",
  "device",
  "language",
  "locale",
  "target_country",
  "country_code",
  "country",
  "landing_page",
  "referrer",
] as const;

const CLICK_ID_FIELDS = [
  "fbclid",
  "fbc",
  "fbp",
  "gclid",
  "gbraid",
  "wbraid",
  "ttclid",
  "twclid",
  "scclid",
  "li_fat_id",
  "rdt_cid",
] as const;

const GA4_FIELDS = [
  "ga_client_id",
  "client_id",
  "ga_session_id",
  "session_id",
  "ga_source",
  "ga4_source",
  "ga_medium",
  "ga4_medium",
  "ga_campaign",
  "ga4_campaign",
  "ga_term",
  "ga_content",
  "ga_landing_page",
  "ga_referrer",
] as const;

function pickFromAttr(
  attr: Record<string, unknown> | null,
  keys: readonly string[]
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    if (!attr) {
      out[k] = null;
      continue;
    }
    const v = attr[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = String(v);
    else out[k] = null;
  }
  return out;
}

function maskLongValue(v: string | null): string | null {
  if (!v) return v;
  if (v.length <= 24) return v;
  return `${v.slice(0, 12)}…${v.slice(-6)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "ads");
    if (denied) return denied;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing donation id" }, { status: 400 });

    const donation = await prisma.donation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paidAt: true,
        createdAt: true,
        amount: true,
        amountUSD: true,
        totalAmount: true,
        currency: true,
        provider: true,
        paymentMethod: true,
        locale: true,
        donorCountryCode: true,
        attribution: true,
        conversionEventsSentAt: true,
        conversionFailedEventsSentAt: true,
        subscriptionId: true,
      },
    });
    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }

    const attr = (donation.attribution as Record<string, unknown> | null) ?? null;
    const resolved = resolveAttribution({
      attribution: attr,
      conversionEventsSentAt: donation.conversionEventsSentAt,
      conversionFailedEventsSentAt: donation.conversionFailedEventsSentAt,
      status: donation.status,
    });

    const utm = pickFromAttr(attr, UTM_FIELDS);
    const clickIds = pickFromAttr(attr, CLICK_ID_FIELDS);
    // Mask long click-ids for safe display while keeping enough to diagnose.
    const clickIdsMasked: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(clickIds)) {
      clickIdsMasked[k] = maskLongValue(v);
    }
    const ga4 = pickFromAttr(attr, GA4_FIELDS);

    // Recent AuditLog entries tied to this donation.
    const audits = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "Donation", entityId: id },
          { entityType: "donation", entityId: id },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        createdAt: true,
        action: true,
        actorRole: true,
        actorName: true,
        messageAr: true,
        messageEn: true,
      },
    });

    // Heuristic: infer per-platform event success from the existing flags.
    // We don't yet have a dedicated ConversionEvent table — when one is added
    // by the Tracking Control Center phase, this block reads from it.
    const trackingEvents = {
      metaBrowserDonate: resolved.platform === "meta" ? null : null,
      metaCapiDonate: !!donation.conversionEventsSentAt && resolved.platform === "meta",
      metaCapiDonateFailed:
        !!donation.conversionFailedEventsSentAt && resolved.platform === "meta",
      ga4Purchase: !!donation.conversionEventsSentAt,
      googleAdsConversion: resolved.platform === "google" ? null : null,
      tiktokEvent: resolved.platform === "tiktok" ? null : null,
      xEvent: resolved.platform === "x" ? null : null,
      eventId: stableDonateEventId(donation.id, "success"),
    };

    // Build the "Diagnosis" section — missing data + likely reason + fix.
    const missing: string[] = [];
    const fixes: string[] = [];
    for (const w of resolved.warnings) {
      missing.push(w.label);
      switch (w.code) {
        case "fbclid_or_fbc_missing":
          fixes.push("تأكد من تشغيل Meta Pixel على صفحة الهبوط وتمرير fbclid في الـ URL.");
          break;
        case "gclid_or_gbraid_missing":
          fixes.push("فعّل Google Ads Auto-Tagging أو مرّر gclid/gbraid يدويًا في الـ URL.");
          break;
        case "ttclid_missing":
          fixes.push("استخدم روابط تتبع TikTok التي تضيف ttclid تلقائيًا.");
          break;
        case "twclid_missing":
          fixes.push("فعّل X (Twitter) auto-tagging في إعدادات الحملة.");
          break;
        case "fbp_fbc_missing":
          fixes.push("تأكد من تحميل Meta Pixel قبل بدء الـ checkout ليكتب fbp/fbc cookies.");
          break;
        case "capi_donate_missing":
          fixes.push("راجع webhook الدفع — لم يستدعِ Meta CAPI Donate لهذا التبرع.");
          break;
        case "capi_donate_failed_only":
          fixes.push("CAPI أرسل DonateFailed فقط — تأكد من أن webhook النجاح يعمل.");
          break;
        case "dynamic_macro_unresolved":
          fixes.push("راجع إعدادات الحملة في المنصة — قيمة macro لم يتم استبدالها.");
          break;
        case "missing_campaign_id":
        case "missing_ad_id":
          fixes.push("استخدم Dynamic URL Parameters في المنصة لتمرير campaign_id / ad_id إلى الـ URL.");
          break;
        case "ga4_client_or_session_missing":
        case "ga4_purchase_missing":
          fixes.push("تأكد من تحميل GA4 measurement قبل تسجيل التبرع.");
          break;
        default:
          break;
      }
    }
    // De-dup fixes
    const dedupFixes = Array.from(new Set(fixes));

    const amountUSD = Number(
      donation.amountUSD ?? donation.totalAmount ?? donation.amount ?? 0
    );

    return NextResponse.json({
      donation: {
        id: donation.id,
        paidAt: donation.paidAt ? donation.paidAt.toISOString() : null,
        createdAt: donation.createdAt.toISOString(),
        status: donation.status,
        amount: donation.amount,
        totalAmount: donation.totalAmount,
        amountUSD,
        currency: donation.currency,
        locale: donation.locale,
        donorCountryCode: donation.donorCountryCode,
        provider: donation.provider,
        paymentMethod: donation.paymentMethod,
        subscriptionId: donation.subscriptionId,
      },
      attribution: {
        platform: resolved.platform,
        platformLabel: PLATFORM_LABEL_AR[resolved.platform],
        status: resolved.status,
        statusLabel: ATTRIBUTION_STATUS_LABEL_AR[resolved.status],
        confidence: resolved.confidence,
        reasons: resolved.reasons,
        warnings: resolved.warnings,
        unresolvedMacros: resolved.unresolvedMacros,
        campaignName: resolved.campaignName,
        campaignId: resolved.campaignId,
        adsetId: resolved.adsetId,
        adId: resolved.adId,
        placement: resolved.placement,
      },
      utm,
      clickIds: clickIdsMasked,
      ga4,
      trackingEvents,
      auditLogs: audits.map((a) => ({
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        action: a.action,
        actorRole: a.actorRole,
        actorName: a.actorName,
        messageAr: a.messageAr,
        messageEn: a.messageEn,
      })),
      diagnosis: {
        missing,
        fixes: dedupFixes,
      },
    });
  } catch (error) {
    console.error("Error fetching ads donation detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch donation detail" },
      { status: 500 }
    );
  }
}
