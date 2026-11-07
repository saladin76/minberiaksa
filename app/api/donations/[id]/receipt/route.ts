import { NextRequest } from "next/server";
import { GET as getReceipt } from "@/app/api/receipts/[donationId]/route";

/**
 * GET /api/donations/:id/receipt  the receipt's old address.
 *
 * The receipt is now the official accounting document rendered from
 * `إيصال التبرع` by `/api/receipts/:id` (server-issued receipt number, Turkish
 * copy, verification code). This address stays so every link already sent in
 * an email or shown in an account keeps opening the receipt; it forwards with
 * the query intact. The jsPDF drawing that used to live here  English-only,
 * because it had no Arabic font  is gone.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A reverse proxy can expose localhost as nextUrl.origin. Reuse the handler
  // directly so old profile/email links keep their cookies and never leave the site.
  return getReceipt(request, { params: Promise.resolve({ donationId: id }) });
}
