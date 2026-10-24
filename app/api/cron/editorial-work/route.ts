import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { runEditorialJobs } from "@/lib/content-editor/editorial-jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, jobs: await runEditorialJobs(request.signal, 2) });
  } catch { console.error("editorial-work cron failed"); return NextResponse.json({ error: "تعذر تشغيل مهام المحتوى" }, { status: 500 }); }
}
