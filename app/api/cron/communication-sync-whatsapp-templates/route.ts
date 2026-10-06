import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { syncMetaWhatsappTemplates } from "@/lib/communication/whatsapp-template-sync";
import { repairInvalidMetaParameterTemplates } from "@/lib/communication/meta-template-publisher";

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

  const actor = { actorRole: "SYSTEM" as const };
  const summary = await syncMetaWhatsappTemplates({ actor });
  if (!summary.ok) {
    return NextResponse.json({ ok: false, error: summary.reason, detail: summary.detail, summary }, { status: 502 });
  }

  // Sync first so repair decisions are based on Meta's latest provider schema. Only provider
  // families proven unusable by the send-time parameter-name limit are republished/versioned.
  const repair = await repairInvalidMetaParameterTemplates(actor).catch((error) => ({
    scanned: 0,
    repaired: 0,
    pending: 0,
    failed: 1,
    results: [],
    error: error instanceof Error ? error.message : String(error),
  }));

  return NextResponse.json({ ok: true, summary, repair });
}
