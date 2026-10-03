import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { listBusinessPortfolioWhatsappAssets } from "@/lib/communication/providers/meta-whatsapp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const result = await listBusinessPortfolioWhatsappAssets();
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, detail: result.detail ?? null },
      { status: result.reason === "META_WHATSAPP_NOT_CONFIGURED" || result.reason === "META_BUSINESS_PORTFOLIO_NOT_CONFIGURED" ? 409 : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    businessPortfolio: {
      id: result.businessId,
      name: result.businessName,
    },
    wabas: result.wabas,
  });
}
