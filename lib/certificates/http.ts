import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { DONATION_TOKEN_PARAM, donationTokenMatches } from "@/lib/donations/access-token";
import { getServerBaseUrl } from "@/lib/server-base-url";
import { messagesFor } from "@/i18n/locale-messages";
import { DonationNotConfirmedError, DonationNotFoundError, issueDonationDocuments, type IssuedDocuments } from "./issue";
import { PdfRendererUnavailableError } from "./pdf";

/**
 * What the three PDF endpoints share: who may fetch a donation's documents,
 * how the documents are fetched, how a PDF goes back, and how the localized
 * filename is picked.
 */

/**
 * Whether the current requester may read documents belonging to donation
 * `donationId`, given the token presented on the request (`?t=`).
 *
 * A signed-in owner, or a holder of the revenue permission, is let in by
 * their session. Anyone else — a guest donor, or a signed-in user who does not
 * own it — needs the donation's access token. The donation id alone opens
 * nothing: it is an identifier that ends up in history, referrers and
 * forwarded mail, not a secret (`DEPLOYED_VS_DESIGN_AUDIT.md` § P1.2).
 */
export async function authorizeDonationAccess(donationId: string, request: NextRequest): Promise<NextResponse | null> {
  const access = await donationAccess(donationId, request.nextUrl.searchParams.get(DONATION_TOKEN_PARAM));
  return access.allowed ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** The same rule, for the print pages: allowed or not, and whether the viewer is staff. */
export async function donationAccess(
  donationId: string,
  presentedToken: string | null | undefined
): Promise<{ allowed: boolean; admin: boolean }> {
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { donorId: true, accessToken: true },
  });
  if (!donation) return { allowed: false, admin: false };

  const session = await getServerSession(authOptions);
  const admin = Boolean(session?.user && userHasDashboardPermission(session.user, "revenue"));
  if (admin || (session?.user && session.user.id === donation.donorId)) return { allowed: true, admin };
  return { allowed: donationTokenMatches(donation.accessToken, presentedToken), admin: false };
}

/** Issue-or-fetch the donation's documents, or the HTTP error explaining why not. */
export async function documentsOrError(donationId: string): Promise<IssuedDocuments | NextResponse> {
  try {
    return await issueDonationDocuments(donationId);
  } catch (error) {
    if (error instanceof DonationNotFoundError) return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    if (error instanceof DonationNotConfirmedError) return NextResponse.json({ error: "Payment not confirmed yet" }, { status: 409 });
    throw error;
  }
}

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/** Map a rendering failure to a response; anything else is rethrown. */
export function pdfErrorResponse(error: unknown): NextResponse {
  if (error instanceof PdfRendererUnavailableError) {
    console.error("[certificates]", error.message);
    return NextResponse.json({ error: "PDF rendering is not available on this server" }, { status: 503 });
  }
  throw error;
}

/** `Content-Disposition` with the UTF-8 filename and an ASCII fallback. */
export function pdfResponse(pdf: Buffer, filename: string, inline = false): NextResponse {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "").trim() || "document.pdf";
  const disposition = `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Origin the headless browser fetches the certificate artwork from. */
export async function assetBaseUrl(): Promise<string> {
  return getServerBaseUrl();
}

type Nested = Record<string, unknown>;
function read(locale: string, path: string[]): string {
  let node: unknown = messagesFor(locale);
  for (const key of path) {
    if (!node || typeof node !== "object") return "";
    node = (node as Nested)[key];
  }
  return typeof node === "string" ? node : "";
}

/**
 * Localized filenames. The email namespace already names the two attachments
 * (`success.attachment0/1`); the waqf certificate takes its cart label plus
 * its number so two certificates from one order never share a name.
 */
export const documentFilename = {
  thanks: (locale: string, serial: string) => `${stripPdf(read(locale, ["email", "success", "attachment0"]) || "Thank-you certificate")} ${serial}.pdf`,
  receipt: (locale: string, receiptNo: string) => `${stripPdf(read(locale, ["email", "success", "attachment1"]) || "Donation receipt")} ${receiptNo}.pdf`,
  waqf: (locale: string, unit: "share" | "meter", number: number) =>
    `${read(locale, ["cart", unit === "meter" ? "meterCertName" : "shareCertName"]) || (unit === "meter" ? "Waqf-metre certificate" : "Waqf-share certificate")} ${number}.pdf`,
};

function stripPdf(name: string): string {
  return name.replace(/\.pdf$/i, "").trim();
}
