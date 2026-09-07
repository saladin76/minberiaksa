import { NextRequest, NextResponse } from "next/server";
import { runSyncJob, type PlatformSelector } from "@/lib/marketing/sync";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";

export const dynamic = "force-dynamic";

const PLATFORMS: PlatformSelector[] = ["meta", "google_ads", "ga4", "tiktok", "x", "twilio"];

function day(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeForLastDays(days: number) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export async function GET(request: NextRequest) {
  // Fails CLOSED — see lib/communication/cron-auth.ts. The previous form ran unauthenticated
  // whenever CRON_SECRET was unset.
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { from, to } = rangeForLastDays(7);
  const results = [];

  for (const platform of PLATFORMS) {
    try {
      const outcome = await runSyncJob({
        platform,
        dateFrom: from,
        dateTo: to,
        triggeredBy: "cron:marketing-platform-sync",
      });
      results.push({ platform, ok: outcome.ok, status: outcome.status, results: outcome.results });
    } catch (error) {
      results.push({
        platform,
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "sync failed",
        results: [],
      });
    }
  }

  const ok = results.some((item) => item.ok);
  const rowsFetched = results.flatMap((item) => item.results).reduce((sum, item) => sum + (item.rowsFetched || 0), 0);

  return NextResponse.json({
    ok,
    range: { from: day(from), to: day(to), days: 7 },
    rowsFetched,
    results,
  }, { headers: { "Cache-Control": "no-store" } });
}
