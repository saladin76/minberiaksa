import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { manualCertificateInput } from "@/lib/certificates/manual-input";
import { buildManualDocument, manualDocumentHtml, signManualPreview } from "@/lib/certificates/manual-render";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "siteContent"); if (denied) return denied;
  const parsed = manualCertificateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "أكمل بيانات المستند المطلوبة قبل المعاينة" }, { status: 400 });
  const document = await buildManualDocument(parsed.data, "000000000000000000000000", "PREVIEW");
  return NextResponse.json({ html: await manualDocumentHtml(document, paymentPublicOrigin(request.url)), preview: signManualPreview(parsed.data, document) }, { headers: { "Cache-Control": "no-store" } });
}
