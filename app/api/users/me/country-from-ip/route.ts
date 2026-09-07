import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import {
  resolveGeoFromRequest,
  type ResolvedUserGeo,
} from "@/lib/geo/country-from-request";
import { countryNameFromIsoCode } from "@/lib/geo/intl-country-name";
import { resolveBestCountryCode } from "@/lib/geo/resolve-best-country-code";

function hasNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseGeoFromClientBody(body: Record<string, unknown> | null): ResolvedUserGeo | null {
  if (!body) return null;
  const codeRaw = body.countryCode;
  const code = typeof codeRaw === "string" ? codeRaw.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null;
  const nameRaw = body.countryName;
  const countryName =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim()
      : countryNameFromIsoCode(code);
  const region = hasNonEmptyString(body.region) ? body.region.trim() : null;
  const city = hasNonEmptyString(body.city) ? body.city.trim() : null;
  return { countryCode: code, countryName, region, city };
}

async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (!text.trim()) return null;
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mergeGeo(
  fromServer: ResolvedUserGeo | null,
  fromClient: ResolvedUserGeo | null
): ResolvedUserGeo | null {
  if (fromServer && fromClient) {
    return {
      countryCode: fromServer.countryCode,
      countryName: fromServer.countryName,
      region: fromServer.region ?? fromClient.region,
      city: fromServer.city ?? fromClient.city,
    };
  }
  return fromServer ?? fromClient;
}

/**
 * Fills `countryCode`, `countryName`, `region`, `city` (+ legacy `country` = countryName)
 * from the best available signal — phone-derived country first, then edge
 * headers / ipapi, then a client-supplied geo body. Also self-heals a stored
 * `countryCode` that disagrees with the phone (was a Meta CAPI sore spot for
 * donors whose mobile carriers proxied through a third country at signup).
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("country-from-ip: NEXTAUTH_SECRET missing");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const token = await getToken({ req: request, secret });
    const userId = token?.sub;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await readJsonBody(request);
    const clientGeo = parseGeoFromClientBody(body);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        country: true,
        countryCode: true,
        countryName: true,
        region: true,
        city: true,
        phone: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Resolve the best country code from all available signals up front. Phone
    // wins over the stored value because Meta CAPI was shipping the wrong
    // country for donors whose carriers proxied through a third country at
    // signup time, leaving a wrong `countryCode` cached on the user. The phone
    // number itself is a far stronger signal — see `resolveBestCountryCode`.
    const phoneOnly = resolveBestCountryCode({
      existing: existing.countryCode,
      phone: existing.phone,
    });
    const storedCode =
      typeof existing.countryCode === "string"
        ? existing.countryCode.trim().toUpperCase()
        : "";
    const needsCountryRewrite =
      phoneOnly.source === "PHONE" &&
      phoneOnly.code != null &&
      phoneOnly.code !== storedCode;

    const allLocationFilled =
      hasNonEmptyString(existing.countryCode) &&
      hasNonEmptyString(existing.countryName) &&
      hasNonEmptyString(existing.city) &&
      hasNonEmptyString(existing.region);
    if (allLocationFilled && !needsCountryRewrite) {
      return NextResponse.json({
        updated: false,
        countryCode: existing.countryCode,
        countryName: existing.countryName,
        region: existing.region,
        city: existing.city,
      });
    }

    const serverGeo = await resolveGeoFromRequest(request);
    const mergedRaw = mergeGeo(serverGeo, clientGeo);

    const best = resolveBestCountryCode({
      existing: existing.countryCode,
      phone: existing.phone,
      serverGeo: serverGeo?.countryCode ?? null,
      clientGeo: clientGeo?.countryCode ?? null,
    });
    if (best.conflict) {
      console.warn(
        `[country-from-ip] conflicting signals for user ${userId}: chose ${best.code} via ${best.source}; existing=${existing.countryCode ?? "null"} phone=${existing.phone ?? "null"} serverGeo=${serverGeo?.countryCode ?? "null"} clientGeo=${clientGeo?.countryCode ?? "null"}`
      );
    }

    const finalCode = best.code;
    if (!finalCode && !mergedRaw) {
      return NextResponse.json({ updated: false, reason: "no_geo" }, { status: 200 });
    }

    // countryName: derive from the chosen code unless we're keeping the
    // stored value (in which case preserve whatever the user/admin saved).
    const finalName = finalCode
      ? best.source === "EXISTING" && hasNonEmptyString(existing.countryName)
        ? String(existing.countryName).trim()
        : countryNameFromIsoCode(finalCode)
      : mergedRaw?.countryName ?? "";

    const merged: ResolvedUserGeo = {
      countryCode: finalCode ?? "",
      countryName: finalName,
      region: hasNonEmptyString(existing.region)
        ? String(existing.region).trim()
        : mergedRaw?.region ?? null,
      city: hasNonEmptyString(existing.city)
        ? String(existing.city).trim()
        : mergedRaw?.city ?? null,
    };
    if (!merged.countryCode) {
      return NextResponse.json({ updated: false, reason: "no_geo" }, { status: 200 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        countryCode: merged.countryCode,
        countryName: merged.countryName,
        region: merged.region,
        city: merged.city,
        country: merged.countryName,
      },
    });

    return NextResponse.json({
      updated: true,
      countryCode: merged.countryCode,
      countryName: merged.countryName,
      region: merged.region,
      city: merged.city,
    });
  } catch (e) {
    console.error("country-from-ip:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
