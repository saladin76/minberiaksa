import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { syncMetaWhatsappTemplates } from "@/lib/communication/whatsapp-template-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keeps Meta approval state fresh without requiring an operator to press Sync.
 * Multi-WABA readiness is conservative: a language is sendable only when every active WABA that
 * routing may select has that language approved.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = await syncMetaWhatsappTemplates({ actor: { actorRole: "SYSTEM" } });
  if (!summary.ok) {
    return NextResponse.json({ ok: false, error: summary.reason, detail: summary.detail, summary }, { status: 502 });
  }
  return NextResponse.json({ ok: true, summary });
}
