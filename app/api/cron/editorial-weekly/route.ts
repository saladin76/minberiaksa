import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { editorialSettings, enqueueWeeklyArticle } from "@/lib/content-editor/editorial-jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await editorialSettings();
    return NextResponse.json({ ok: true, enabled: settings.weeklyEnabled, created: settings.weeklyEnabled ? await enqueueWeeklyArticle() : false });
  } catch { console.error("editorial-weekly cron failed"); return NextResponse.json({ error: "تعذر تشغيل مهام المحتوى" }, { status: 500 }); }
}
