import { NextRequest, NextResponse } from "next/server";
import { getRawTrackingSettings, trackingString } from "@/lib/tracking/tracking-settings";

const FB_API_VERSION = "v21.0";

// POST /api/tracking/facebook-capi — server-side Conversion API (no auth; validate server-side only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      event_name,
      event_id,
      fbp,
      fbc,
      url,
      value,
      currency = "USD",
      user_agent,
      client_ip,
      content_ids,
      content_type,
      num_items,
      contents,
    } = body as {
      event_name: string;
      event_id?: string;
      fbp?: string;
      fbc?: string;
      url?: string;
      value?: number;
      currency?: string;
      user_agent?: string;
      client_ip?: string;
      content_ids?: string[];
      content_type?: string;
      num_items?: number;
      contents?: { id: string; quantity?: number }[];
    };

    if (!event_name) {
      return NextResponse.json({ error: "event_name required" }, { status: 400 });
    }

    const row = await getRawTrackingSettings();
    const pixelId = trackingString(row, "facebookPixelId") || trackingString(row, "metaPixelId");
    const accessToken = trackingString(row, "facebookAccessToken") || trackingString(row, "metaAccessToken");
    if (!pixelId || !accessToken) {
      return NextResponse.json({ ok: false, reason: "pixel not configured" }, { status: 200 });
    }

    const event_time = Math.floor(Date.now() / 1000);
    const user_data: Record<string, string> = {};
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;
    if (client_ip) user_data.client_ip_address = client_ip;
    if (user_agent) user_data.client_user_agent = user_agent;

    const custom_data: Record<string, unknown> = {};
    if (value != null) custom_data.value = Number(value);
    if (currency) custom_data.currency = currency;
    if (content_ids?.length) custom_data.content_ids = content_ids;
    if (content_type) custom_data.content_type = content_type;
    if (num_items != null) custom_data.num_items = num_items;
    if (contents?.length) custom_data.contents = contents;

    const payload = {
      data: [
        {
          event_name,
          event_time,
          event_id: event_id || `server_${event_time}_${Math.random().toString(36).slice(2)}`,
          event_source_url: url || undefined,
          action_source: "website",
          user_data: Object.keys(user_data).length ? user_data : undefined,
          custom_data: Object.keys(custom_data).length ? custom_data : undefined,
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      console.error("Facebook CAPI error:", data);
      return NextResponse.json({ ok: false, error: data?.error?.message }, { status: 200 });
    }
    return NextResponse.json({ ok: true, events_received: data?.events_received });
  } catch (e) {
    console.error("Facebook CAPI request failed:", e);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 200 });
  }
}
