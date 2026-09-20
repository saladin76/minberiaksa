import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { isObjectId } from "@/lib/slug";
import { getServerBaseUrl } from "@/lib/server-base-url";
import { isValidLocale } from "@/lib/locales";
import { donorMayAccessClaim, findClaimByDonation, submitBankTransferReceipt } from "@/lib/donations/bank-transfer-claims";
import { serializeClaimForDonor } from "@/lib/donations/bank-transfer-serializers";
import { MAX_RECEIPT_BYTES, inferReceiptMime, validateReceiptFile } from "@/lib/uploads/receipt-file-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A phone photo of a receipt is several megabytes; give the upload room. */
export const maxDuration = 60;

function cleanText(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The donor uploads the transfer receipt (photo, screenshot or PDF) with the
 * few details that help the finance team find the line on the statement.
 * Moves the claim to UNDER_REVIEW; the donation itself stays "قيد التأكيد"
 * until a finance officer confirms it from the dashboard.
 *
 * `error` codes rather than sentences: the page translates them, and a code
 * is what the form can branch on ("attempts used up" gets a different screen).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isObjectId(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const claim = await findClaimByDonation(id);
  if (!claim) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const session = await getServerSession(authOptions);
  const token = request.nextUrl.searchParams.get("t");
  if (!donorMayAccessClaim(claim, session?.user?.id, token)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });

  const mimeType = inferReceiptMime(file);
  const rejection = validateReceiptFile({ type: mimeType, size: file.size, name: file.name });
  if (rejection) return NextResponse.json({ error: `FILE_${rejection.toUpperCase()}` }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0) return NextResponse.json({ error: "FILE_EMPTY" }, { status: 400 });
  if (buffer.byteLength > MAX_RECEIPT_BYTES) return NextResponse.json({ error: "FILE_SIZE" }, { status: 413 });

  const localeIn = cleanText(form.get("locale"), 8) ?? claim.donation.locale ?? "en";
  const locale = isValidLocale(localeIn) ? localeIn : "en";

  const result = await submitBankTransferReceipt({
    claim,
    file: { buffer, mimeType, fileName: file.name || "receipt" },
    senderName: cleanText(form.get("senderName"), 120),
    transferDate: parseDate(form.get("transferDate")),
    transferReference: cleanText(form.get("transferReference"), 80),
    donorNote: cleanText(form.get("note"), 600),
    locale,
    origin: await getServerBaseUrl(),
  });

  if (!result.ok) {
    const status = result.reason === "UPLOAD_FAILED" ? 502 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, claim: serializeClaimForDonor(result.claim, locale) });
}
