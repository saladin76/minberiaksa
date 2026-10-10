import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import { searchPublicContent } from "@/lib/minbar/public-search";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") ?? "ar";
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])) {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }
  if (query.length > 90) return NextResponse.json({ error: "Query too long" }, { status: 400 });
  try {
    const items = await searchPublicContent(locale, query, 8);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ error: "Search temporarily unavailable" }, { status: 503 });
  }
}
