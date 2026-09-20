import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/donations/:id/receipt — the receipt's old address.
 *
 * The receipt is now the official accounting document rendered from
 * `إيصال التبرع` by `/api/receipts/:id` (server-issued receipt number, Turkish
 * copy, verification code). This address stays so every link already sent in
 * an email or shown in an account keeps opening the receipt; it forwards with
 * the query intact. The jsPDF drawing that used to live here — English-only,
 * because it had no Arabic font — is gone.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(`/api/receipts/${encodeURIComponent(id)}`, request.nextUrl.origin);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 307);
}
