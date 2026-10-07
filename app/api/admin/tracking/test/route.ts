import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { getRawTrackingSettings, TRACKING_SETTINGS_TRACKING_TRACKING_SETTINGS_COLLECTION } from "@/lib/tracking/tracking-settings";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { sendMetaCapiEvent } from "@/lib/tracking/meta-capi";

type Platform = "meta" | "ga4" | "google_ads" | "tiktok" | "x";


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(row: Record<string, unknown> | null, key: string): string | null {
  const v = row?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function bool(row: Record<string, unknown> | null, key: string): boolean {
  return row?.[key] === true;
}

function missingConfig(platform: Platform, missingFields: string[], guidance: string[]) {
  return NextResponse.json({
    ok: false,
    platform,
    status: "missing_config",
    message: "إعدادات ناقصة  أكمل الحقول المطلوبة أولاً.",
    missingFields,
    guidance,
  });
}

/* `summary` is whatever the provider returned  a `MetaCapiResult`, a GA4 reply  so it is typed as
   an object rather than an index signature it does not structurally satisfy. */
async function audit(platform: Platform, status: string, eventName: string, eventId: string, summary: object, error?: string) {
  const session = await getServerSession(authOptions);
  if (!session) return;
  const actor = auditActorFromDashboardSession(session);
  await writeAuditLog({
    ...actor,
    stream: "TEAM",
    action: "TRACKING_TEST_EVENT",
    messageAr: `اختبار تتبع ${platform}: ${status}`,
    entityType: "TrackingSettings",
    metadata: {
      platform,
      status,
      event_name: eventName,
      event_id: eventId,
      responseSummary: summary,
      errorSummary: error ? String(error).slice(0, 240) : undefined,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnectionsTest");
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const platform = isRecord(body) ? body.platform : undefined;
  if (!["meta", "ga4", "google_ads", "tiktok", "x"].includes(String(platform))) {
    return NextResponse.json({ ok: false, error: "Invalid platform" }, { status: 400 });
  }

  const p = platform as Platform;
  const settings = await getRawTrackingSettings();
  const eventId = `test_${p}_${Date.now()}`;

  if (p === "meta") {
    const pixelId = str(settings, "facebookPixelId");
    const accessToken = str(settings, "facebookAccessToken");
    const eventName = str(settings, "metaDonateEventName") || "Donate";
    const testEventCode = str(settings, "facebookTestEventCode") || undefined;
    const missing: string[] = [];
    const guidance: string[] = [];
    if (!pixelId) {
      missing.push("facebookPixelId");
      guidance.push("أضف Pixel ID من Meta Events Manager.");
    }
    if (!accessToken) {
      missing.push("facebookAccessToken");
      guidance.push("أضف Access Token الخاص بـ Meta CAPI من Business Settings > System Users.");
    }
    if (missing.length || !pixelId || !accessToken) {
      /* The `!pixelId || !accessToken` arm restates what `missing` already records  the compiler cannot
         follow the array length back to the two values, and the pair is about to be sent to Meta. */
      await audit(p, "missing_config", eventName, eventId, { missingFields: missing });
      return missingConfig(p, missing, guidance);
    }

    const result = await sendMetaCapiEvent(
      {
        event_name: eventName,
        event_id: eventId,
        event_source_url: "https://www.minberiaksa.org/dashboard/platform-connections/tracking",
        test_event_code: testEventCode,
        user_data: {
          email: "tracking-test@minberiaksa.org",
          external_id: "tracking-control-center-test",
          user_agent: "TrackingControlCenter/1.0",
        },
        custom_data: {
          value: 0,
          currency: "USD",
          content_type: "test",
          content_name: "Tracking Control Center Test",
          status: "test",
        },
      },
      { pixelId, accessToken }
    );
    await audit(p, result.ok ? "success" : "failed", eventName, eventId, result, result.error || result.reason);
    return NextResponse.json({
      ok: result.ok,
      platform: p,
      status: result.ok ? "success" : "failed",
      message: result.ok ? "تم إرسال حدث اختبار إلى Meta بنجاح." : result.error || result.reason || "فشل إرسال اختبار Meta.",
      responseId: result.fbtrace_id,
      eventId,
      error: result.error || result.reason,
    });
  }

  if (p === "ga4") {
    const measurementId = str(settings, "gaMeasurementId");
    const apiSecret = str(settings, "gaApiSecret");
    const missing: string[] = [];
    const guidance: string[] = [];
    if (!measurementId) {
      missing.push("gaMeasurementId");
      guidance.push("أضف Measurement ID من GA4 Data Stream ويبدأ غالباً بـ G-.");
    }
    if (!apiSecret) {
      missing.push("gaApiSecret");
      guidance.push("أضف API Secret من GA4 Admin > Data Streams > Measurement Protocol API secrets.");
    }
    if (missing.length || !measurementId || !apiSecret) {
      /* Same restatement as the Meta branch: the compiler cannot follow `missing.length` back to the
         two values, and both are about to be sent to GA4. */
      await audit(p, "missing_config", "test_tracking_event", eventId, { missingFields: missing });
      return missingConfig(p, missing, guidance);
    }

    const endpoint = bool(settings, "gaDebugMode")
      ? "https://www.google-analytics.com/debug/mp/collect"
      : "https://www.google-analytics.com/mp/collect";
    const res = await fetch(`${endpoint}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: `tracking-test.${Date.now()}`,
        events: [
          {
            name: "test_tracking_event",
            params: {
              debug_mode: bool(settings, "gaDebugMode"),
              event_id: eventId,
              value: 0,
              currency: "USD",
              source: "tracking_control_center",
            },
          },
        ],
      }),
    });
    const text = await res.text().catch(() => "");
    await audit(p, res.ok ? "success" : "failed", "test_tracking_event", eventId, { status: res.status, body: text.slice(0, 300) }, res.ok ? undefined : text);
    return NextResponse.json({
      ok: res.ok,
      platform: p,
      status: res.ok ? "success" : "failed",
      message: res.ok ? "تم إرسال حدث اختبار إلى GA4 بنجاح." : "فشل إرسال حدث اختبار إلى GA4.",
      eventId,
      error: res.ok ? undefined : text.slice(0, 300),
    });
  }

  const validators: Record<Exclude<Platform, "meta" | "ga4">, { event: string; required: string[]; guidance: string[]; message: string }> = {
    google_ads: {
      event: "conversion",
      required: ["googleAdsConversionId", "googleAdsConversionLabel"],
      guidance: ["أضف Conversion ID من Google Ads.", "أضف Conversion Label من Google Ads."],
      message: "إعدادات Google Ads مكتملة، لكن إرسال اختبار مباشر سيتم تفعيله لاحقًا.",
    },
    tiktok: {
      event: "CompletePayment",
      required: ["tiktokPixelId", "tiktokAccessToken"],
      guidance: ["أضف Pixel Code من TikTok Events Manager.", "أضف Access Token الخاص بـ TikTok Events API."],
      message: "إعدادات TikTok مكتملة، لكن إرسال اختبار مباشر سيتم تفعيله لاحقًا.",
    },
    x: {
      event: "Purchase",
      required: ["xPixelId", "xAccessToken", "xAdAccountId"],
      guidance: ["أضف X Pixel ID.", "أضف X Access Token.", "أضف X Ad Account ID."],
      message: "إعدادات X مكتملة، لكن إرسال اختبار مباشر سيتم تفعيله لاحقًا.",
    },
  };

  const cfg = validators[p as Exclude<Platform, "meta" | "ga4">];
  const missing = cfg.required.filter((field) => !str(settings, field));
  if (missing.length) {
    await audit(p, "missing_config", cfg.event, eventId, { missingFields: missing });
    return missingConfig(p, missing, cfg.guidance);
  }
  await audit(p, "not_implemented", cfg.event, eventId, { ready: true });
  return NextResponse.json({
    ok: true,
    platform: p,
    status: "not_implemented",
    message: cfg.message,
    eventId,
  });
}
