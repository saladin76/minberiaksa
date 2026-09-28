import { NextResponse } from "next/server";
import { loadConciergeSettings } from "@/lib/ai/concierge/settings";
import { publicConciergeConfig } from "@/lib/ai/concierge/settings-shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/donation-concierge/config  the launcher's switches (shown or
 * not, teaser bubble, pulse). Public and tiny; nothing else from the concierge
 * settings (team notes, transcripts, attribution) leaves the server.
 */
export async function GET() {
  const settings = await loadConciergeSettings();
  return NextResponse.json(publicConciergeConfig(settings), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
  });
}
