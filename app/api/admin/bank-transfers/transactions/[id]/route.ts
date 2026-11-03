import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { createDonationFromBankTransfer } from "@/lib/donations/bank-transfer-donation";
import { isValidLocale } from "@/lib/locales";
import { rawCommand } from "@/lib/prisma-raw-command";
import { statementRead } from "@/lib/bank-transfers/statement-import";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COLLECTION = "BankTransferTransaction";
const approvalFailure: Record<string, string> = {
  DATABASE_UNAVAILABLE: "قاعدة البيانات غير متاحة",
  MISSING_HASH: "العملية بلا معرّف فريد",
  INVALID_AMOUNT: "قيمة العملية غير صالحة",
  DONOR_NOT_FOUND: "المتبرع المختار غير موجود",
  DONOR_CONTACT_NOT_FOUND: "لا يوجد متبرع بهذا البريد أو الهاتف",
  DONOR_CONTACT_AMBIGUOUS: "أكثر من متبرع بهذا البريد أو الهاتف  حدّد المتبرع يدويًا",
  CAMPAIGN_NOT_FOUND: "المشروع المختار غير موجود أو محذوف",
  DONOR_CREATE_FAILED: "تعذّر إنشاء سجل المتبرع",
  DONATION_CREATE_FAILED: "تعذّر إنشاء التبرع",
};
const statuses = new Set(["PENDING_REVIEW", "APPROVED", "IGNORED", "DELETED"]);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const clean = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const ready = {
  donationId: { $in: [null, ""] },
  approvalClaim: { $exists: false },
  status: { $nin: ["APPROVED", "IMPORTED", "DELETED"] },
};
async function mutate(
  request: NextRequest,
  params: Promise<{ id: string }>,
  deleting = false,
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id))
      return NextResponse.json(
        { error: "معرّف العملية غير صالح" },
        { status: 400 },
      );
    const body = deleting ? { status: "DELETED" } : obj(await request.json());
    const status = clean(body.status);
    if (status && !statuses.has(status))
      return NextResponse.json({ error: "الحالة غير صالحة" }, { status: 400 });
    const doc = (
      await statementRead(prisma, COLLECTION, { _id: { $oid: id } })
    )[0];
    if (!doc)
      return NextResponse.json(
        { error: "العملية غير موجودة" },
        { status: 404 },
      );
    if (doc.donationId || ["APPROVED", "IMPORTED"].includes(String(doc.status)))
      return NextResponse.json(
        {
          error:
            "العملية معتمدة. يجب معالجة أي تعديل مالي من سجل التبرع المرتبط.",
          code: "TRANSFER_ALREADY_APPROVED",
        },
        { status: 409 },
      );
    if (doc.approvalClaim || doc.status === "DELETED")
      return NextResponse.json(
        {
          error:
            "العملية مقفلة أو يجري اعتمادها. راجع حالتها قبل تكرار الإجراء.",
          code: "TRANSFER_REVIEW_LOCKED",
        },
        { status: 409 },
      );
    const actor = auditActorFromDashboardSession(session!);
    const now = { $date: new Date().toISOString() };
    const $set: Record<string, unknown> = {
      updatedAt: now,
      reviewedBy: actor.actorId,
      reviewedByName: actor.actorName,
    };
    for (const field of [
      "donorName",
      "finalProject",
      "campaignId",
      "donorContact",
    ])
      if (field in body) $set[field] = clean(body[field]);
    if ("donorUserId" in body) $set.donorUserIdChoice = clean(body.donorUserId);
    if (typeof body.donorLocale === "string" && isValidLocale(body.donorLocale))
      $set.donorLocale = body.donorLocale;
    if (status) $set.status = status;
    if (status === "IGNORED") $set.ignoredAt = now;
    if (status === "DELETED")
      Object.assign($set, {
        deletedAt: now,
        deletedBy: actor.actorId,
        deletedByName: actor.actorName,
      });
    let donationId: string | null = null;
    let claim: string | null = null;
    if (status === "APPROVED") {
      if (body.approvalConfirmed !== true)
        return NextResponse.json(
          {
            error: "راجع المبلغ والمشروع والمتبرع ثم أكد الاعتماد.",
            code: "TRANSFER_CONFIRM_REQUIRED",
          },
          { status: 422 },
        );
      if (
        doc.direction !== "CREDIT" ||
        typeof doc.amount !== "number" ||
        !Number.isFinite(doc.amount) ||
        doc.amount <= 0 ||
        !doc.transactionDate
      )
        return NextResponse.json(
          { error: "لا يمكن اعتماد حركة غير واردة أو ناقصة البيانات." },
          { status: 422 },
        );
      claim = randomUUID();
      const claimed = obj(
        await prisma.$runCommandRaw(
          rawCommand({
            update: COLLECTION,
            updates: [
              {
                q: { _id: { $oid: id }, ...ready },
                u: { $set: { approvalClaim: claim, approvalStartedAt: now } },
              },
            ],
          }),
        ),
      );
      if (
        claimed.ok !== 1 ||
        claimed.writeConcernError ||
        claimed.n !== 1 ||
        (Array.isArray(claimed.writeErrors) && claimed.writeErrors.length)
      )
        return NextResponse.json(
          {
            error: "تغيّرت العملية أثناء المراجعة. حدّث الصفحة.",
            code: "TRANSFER_REVIEW_CONFLICT",
          },
          { status: 409 },
        );
      const effective = { ...doc, ...$set };
      const result = await createDonationFromBankTransfer({
        transactionHash: String(doc.transactionHash ?? ""),
        amount: doc.amount,
        currency: String(doc.currency ?? "TRY"),
        transactionDate: clean(doc.transactionDate),
        donorName: clean(effective.donorName),
        donorLocale: clean(effective.donorLocale),
        project: clean(effective.finalProject) ?? clean(doc.suggestedProject),
        note: clean(doc.note),
        description: clean(doc.description),
        reference: clean(doc.reference),
        bankId: clean(doc.bankId),
        bankIban: clean(doc.bankIban),
        campaignId: clean(effective.campaignId),
        donorContact: clean(effective.donorContact),
        donorUserId: clean(effective.donorUserIdChoice),
      });
      if (!result.ok) {
        // Donation creation returned a known failure; retain reviewer choices and permit correction.
        await prisma.$runCommandRaw(
          rawCommand({
            update: COLLECTION,
            updates: [
              {
                q: { _id: { $oid: id }, approvalClaim: claim },
                u: { $unset: { approvalClaim: "", approvalStartedAt: "" } },
              },
            ],
          }),
        );
        return NextResponse.json(
          {
            error: approvalFailure[result.reason] ?? "تعذّر اعتماد التبرع. راجع بيانات المتبرع والمشروع.",
            code: result.reason,
          },
          { status: 422 },
        );
      }
      donationId = result.donationId;
      Object.assign($set, {
        donationId,
        donorUserId: result.donorId,
        approvedAt: now,
        convertedToDonation: true,
        convertedAt: now,
      });
    }
    const saved = obj(
      await prisma.$runCommandRaw(
        rawCommand({
          update: COLLECTION,
          updates: [
            {
              q: {
                _id: { $oid: id },
                ...(claim ? { approvalClaim: claim } : ready),
              },
              u: {
                $set,
                ...(claim
                  ? { $unset: { approvalClaim: "", approvalStartedAt: "" } }
                  : {}),
              },
            },
          ],
        }),
      ),
    );
    if (
      saved.ok !== 1 ||
      saved.writeConcernError ||
      saved.n !== 1 ||
      (Array.isArray(saved.writeErrors) && saved.writeErrors.length)
    )
      return NextResponse.json(
        {
          error: "تعذّر تأكيد حفظ العملية. راجع حالتها قبل إعادة الإجراء.",
          code: "TRANSFER_WRITE_UNRESOLVED",
        },
        { status: 409 },
      );
    await writeAuditLog({
      ...actor,
      stream: "TEAM",
      action:
        status === "DELETED"
          ? "BANK_TRANSFER_DELETED"
          : "BANK_TRANSFER_REVIEWED",
      messageAr: "مراجعة حركة تحويل بنكي",
      entityType: COLLECTION,
      entityId: id,
      metadata: { status, donationId, softDelete: status === "DELETED" },
    });
    return NextResponse.json({ ok: true, donationId });
  } catch {
    return NextResponse.json(
      { error: "تعذّر تأكيد الإجراء. راجع حالة العملية قبل تكراره." },
      { status: 503 },
    );
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return mutate(request, params);
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return mutate(request, params, true);
}
