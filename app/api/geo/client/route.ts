/**
 * GET /api/geo/client
 *
 * Public, server-side geo lookup. Returns the visitor's ISO country code +
 * country name + region + city using (in order):
 *   1. Vercel edge headers (x-vercel-ip-country / -city / -country-region)
 *   2. Cloudflare's cf-ipcountry
 *   3. An ipapi.co server-side IP lookup
 *
 * This replaces the four-place pattern of `fetch("https://ipapi.co/json/")`
 * from the browser, which:
 *   • triggered CORS / antivirus / ad-blocker failures (visible in the console
 *     of the Meta Pixel diagnostic the user shared)
 *   • leaked the visitor's IP to a third party from every donation flow
 *   • added a ~500 ms blocking step before the donation request itself
 *
 * Response is cached for 1 hour at the edge so repeat visits don't re-hit
 * ipapi from our server.
 */

import { NextResponse, type NextRequest } from "next/server";
import { resolveGeoFromRequest } from "@/lib/geo/country-from-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const geo = await resolveGeoFromRequest(request);
  if (!geo) {
    return NextResponse.json(
      { ok: false, reason: "no_geo" },
      {
        status: 200,
        headers: {
          // Short cache even on miss — IP→country lookups don't change second
          // to second and we don't want to retry through the failure path on
          // every page transition.
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      country_code: geo.countryCode,
      country_name: geo.countryName,
      region: geo.region,
      city: geo.city,
    },
    {
      status: 200,
      headers: {
        // Edge-cached per-IP via the upstream CDN. Vercel/CF route requests by
        // IP, so the cached entries naturally segment by visitor location.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    }
  );
}
