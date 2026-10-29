import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { prisma } from "@/lib/prisma";
import { manualCertificateInput } from "@/lib/certificates/manual-input";
import { buildManualDocument, issuedDocumentToken, verifyManualPreview } from "@/lib/certificates/manual-render";
import { nextSequenceNumber, padSerial } from "@/lib/certificates/sequences";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "siteContent"); if (denied) return denied;
  const rows = await prisma.issuedCertificate.findMany({ orderBy: { createdAt: "desc" }, take: 25, select: { id: true, serial: true, kind: true, locale: true, donorName: true, recipientName: true, deliveryState: true, createdAt: true, issuedAt: true } });
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "siteContent"); if (denied) return denied;
  const raw = await request.json().catch(() => null);
  const parsed = manualCertificateInput.safeParse(raw);
  if (!parsed.success || typeof raw?.requestKey !== "string" || !/^[a-f0-9-]{36}$/i.test(raw.requestKey)) return NextResponse.json({ error: "راجع الاسم واللغة والمبلغ وبيانات المستلم وتأكيد الاستلام", fields: parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join(".")) }, { status: 400 });
  if (parsed.data.kind === "RECEIPT" && !userHasDashboardPermission(session?.user, "donationsEdit")) return NextResponse.json({ error: "إصدار إيصال مالي يحتاج صلاحية إدارة التبرعات" }, { status: 403 });
  const input = parsed.data;
  const trustedPreview = raw.preview && verifyManualPreview(input, raw.preview) ? raw.preview : null;
  if (raw.preview && !trustedPreview) return NextResponse.json({ error: "تغيرت البيانات أو انتهت صلاحية المعاينة؛ أعد المعاينة" }, { status: 409 });
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  let record = await prisma.issuedCertificate.findUnique({ where: { requestKey: raw.requestKey } });
  if (record && (record.inputHash !== hash || record.createdById !== session!.user!.id)) return NextResponse.json({ error: "تغيرت بيانات المستند؛ أعد إنشاء الطلب" }, { status: 409 });
  if (!record) {
    const id = randomBytes(12).toString("hex"), year = Number(input.issueDate.slice(0, 4));
    const serial = `MIA-MAN-${year}-${padSerial(await nextSequenceNumber(`manual-${year}`))}`;
    const document = trustedPreview ? structuredClone(trustedPreview.document) : await buildManualDocument(input, id, serial);
    if (document.kind === "receipt") { document.receiptNo = serial; document.verifyCode = id.slice(-8).toUpperCase(); }
    else { document.certificateId = id; document.serial = serial; if (document.kind === "waqf") document.certNo = serial; }
    try {
      record = await prisma.issuedCertificate.create({ data: { id, requestKey: raw.requestKey, inputHash: hash, kind: input.kind, locale: input.locale, donorName: input.donorName, recipientName: input.recipientName || input.donorName, recipientEmail: input.email || null, recipientPhone: input.phone || null, serial, issuedAt: new Date(`${input.issueDate}T12:00:00Z`), document: document as unknown as Prisma.InputJsonValue, createdById: session!.user!.id! } });
      queueAuditLog({ ...auditActorFromDashboardSession(session!), action: "MANUAL_CERTIFICATE_ISSUED", messageAr: "إصدار مستند يدوي مستقل عن دفتر التبرعات", entityType: "IssuedCertificate", entityId: id, metadata: { kind: input.kind, locale: input.locale, serial } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      record = await prisma.issuedCertificate.findUnique({ where: { requestKey: raw.requestKey } });
      if (!record || record.inputHash !== hash || record.createdById !== session!.user!.id) return NextResponse.json({ error: "تعذر تأكيد إنشاء المستند" }, { status: 409 });
    }
  }
  return NextResponse.json({ id: record.id, serial: record.serial, url: `/api/certificates/issued/${record.id}?token=${issuedDocumentToken(record.id)}` }, { headers: { "Cache-Control": "no-store" } });
}
