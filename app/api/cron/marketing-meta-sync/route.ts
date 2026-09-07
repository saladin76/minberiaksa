import { NextRequest, NextResponse } from "next/server";
import { runSyncJob } from "@/lib/marketing/sync";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";

/**
 * NOT scheduled in vercel.json — deliberately, and it should stay that way.
 *
 * `/api/cron/marketing-platform-sync` runs every 3 hours over
 * ["meta", "google_ads", "ga4", "tiktok", "x", "twilio"] — "meta" included — so this route is
 * fully superseded for scheduled work. Adding it to vercel.json would sync Meta twice on
 * overlapping windows for no benefit.
 *
 * Kept because it is still useful to trigger manually: a Meta-only re-sync over a specific
 * date range, without waiting on (or re-running) the other five platforms.
 */
export const dynamic = "force-dynamic";

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

  try {
    const { from, to } = rangeForLastDays(7);
    const outcome = await runSyncJob({
      platform: "meta",
      dateFrom: from,
      dateTo: to,
      triggeredBy: "cron:marketing-meta-sync",
    });

    const rowsFetched = outcome.results.reduce((sum, result) => sum + (result.rowsFetched || 0), 0);
    return NextResponse.json({
      ok: outcome.ok,
      status: outcome.status,
      platform: "META",
      range: { from: day(from), to: day(to), days: 7 },
      rowsFetched,
      results: outcome.results.map((result) => ({
        connectionId: result.connectionId,
        platform: result.platform,
        status: result.status,
        rowsFetched: result.rowsFetched,
        message: result.message,
        error: result.error ?? null,
      })),
    });
  } catch (error) {
    console.error("[cron/marketing-meta-sync]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Meta marketing sync failed" },
      { status: 500 }
    );
  }
}
