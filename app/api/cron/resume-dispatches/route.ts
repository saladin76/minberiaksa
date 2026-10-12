import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { resumeStaleDispatches } from "@/lib/events/resume-stale-dispatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Re-sends receipts and donor messages whose dispatch was cut off — see `resumeStaleDispatches`. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await resumeStaleDispatches();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/resume-dispatches] failed:", error);
    return NextResponse.json({ ok: false, error: "run failed" }, { status: 500 });
  }
}
