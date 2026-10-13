/**
 * GET /api/geo/client
 *
 * Public, server-side geo lookup. Returns the visitor's ISO country code +
 * country name + region + city using (in order):
 *   1. Vercel edge headers (x-vercel-ip-country / -city / -country-region)
 *   2. Cloudflare's cf-ipcountry
 *   3. The client IP looked up in several databases (`lib/geo/ip-lookup.ts`)
 *
 * This replaces the four-place pattern of `fetch("https://ipapi.co/json/")`
 * from the browser, which:
 *   • triggered CORS / antivirus / ad-blocker failures (visible in the console
 *     of the Meta Pixel diagnostic the user shared)
 *   • leaked the visitor's IP to a third party from every donation flow
 *   • added a ~500 ms blocking step before the donation request itself
 *
 * The answer is about one visitor, so it is never stored in a shared cache.
 * It used to be sent `public, s-maxage=3600`: the CDN keys its cache by URL,
 * not by IP, so the first visitor's country was handed to everyone else for
 * an hour  a donor in Palestine was told Yemen because someone in Yemen had
 * asked first. Repeat lookups are absorbed by the per-IP memory cache in
 * `lib/geo/ip-lookup.ts` instead.
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
        headers: { "Cache-Control": "private, no-store" },
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
      // This browser only: never a CDN or proxy cache (see above).
      headers: { "Cache-Control": "private, max-age=600" },
    }
  );
}
