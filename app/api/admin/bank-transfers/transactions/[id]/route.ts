import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { createDonationFromBankTransfer } from "@/lib/donations/bank-transfer-donation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "BankTransferTransaction";
const ALLOWED_STATUSES = new Set(["PENDING_REVIEW", "APPROVED", "IGNORED", "DELETED"]);
const ALLOWED_LOCALES = new Set(["ar", "tr", "en", "fr", "de", "es", "pt", "id"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
    if (denied) return denied;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Transaction id is required" }, { status: 400 });

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const now = new Date();
    const actor = auditActorFromDashboardSession(session!);
    const $set: Record<string, unknown> = { updatedAt: now, reviewedBy: actor.actorId, reviewedByName: actor.actorName };

    const donorName = cleanString(body.donorName);
    if ("donorName" in body) $set.donorName = donorName;

    const finalProject = cleanString(body.finalProject ?? body.suggestedProject);
    if (finalProject) $set.finalProject = finalProject;

    const donorLocale = cleanString(body.donorLocale);
    if (donorLocale && ALLOWED_LOCALES.has(donorLocale)) $set.donorLocale = donorLocale;

    const status = cleanString(body.status);
    if (status) {
      if (!ALLOWED_STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      $set.status = status;
      if (status === "APPROVED") $set.approvedAt = now;
      if (status === "IGNORED") $set.ignoredAt = now;
      if (status === "DELETED") {
        $set.deletedAt = now;
        $set.deletedBy = actor.actorId;
        $set.deletedByName = actor.actorName;
      }
    }

    // On approval → create a real Donation (provider BANK_TRANSFER) so it shows on the dashboards with
    // a "تحويل بنكي" hint. Deduped by donorName; idempotent per transaction hash; no messages sent.
    let donationId: string | null = null;
    if (status === "APPROVED") {
      const found = await prisma.$runCommandRaw({ find: COLLECTION, filter: { _id: { $oid: id } }, limit: 1 }).catch(() => null);
      const doc = isRecord(found) && isRecord(found.cursor) && Array.isArray(found.cursor.firstBatch)
        ? (found.cursor.firstBatch[0] as Record<string, unknown> | undefined) ?? null
        : null;
      if (doc && !doc.donationId) {
        const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
        const result = await createDonationFromBankTransfer({
          transactionHash: String(doc.transactionHash ?? ""),
          donorName: (typeof $set.donorName === "string" ? $set.donorName : pick(doc.donorName)) ?? null,
          amount: typeof doc.amount === "number" ? doc.amount : Number(doc.amount) || 0,
          currency: String(doc.currency ?? "TRY"),
          transactionDate: pick(doc.transactionDate),
          donorLocale: (typeof $set.donorLocale === "string" ? $set.donorLocale : pick(doc.donorLocale)) ?? null,
          project: (typeof $set.finalProject === "string" ? $set.finalProject : pick(doc.finalProject) ?? pick(doc.suggestedProject)) ?? null,
          note: pick(doc.note),
          description: pick(doc.description),
          reference: pick(doc.reference),
          bankId: pick(doc.bankId),
          bankIban: pick(doc.bankIban),
        });
        if (result.ok) {
          donationId = result.donationId;
          $set.donationId = result.donationId;
          $set.donorUserId = result.donorId;
          $set.convertedToDonation = true;
          $set.convertedAt = now;
        }
      } else if (doc && typeof doc.donationId === "string") {
        donationId = doc.donationId;
      }
    }

    await prisma.$runCommandRaw({
      update: COLLECTION,
      updates: [{ q: { _id: { $oid: id } }, u: { $set }, upsert: false }],
    });

    await writeAuditLog({
      ...actor,
      stream: "TEAM",
      action: status === "DELETED" ? "BANK_TRANSFER_DELETED" : "BANK_TRANSFER_REVIEWED",
      messageAr: status === "DELETED" ? `${actor.actorName ?? "مسؤول"} حذف عملية تحويل بنكي نهائيًا` : `${actor.actorName ?? "مسؤول"} راجع عملية تحويل بنكي`,
      entityType: "BankTransferTransaction",
      entityId: id,
      metadata: { status: $set.status, donorLocale: $set.donorLocale, finalProject: $set.finalProject, donationId },
    });

    return NextResponse.json({ ok: true, donationId });
  } catch (error) {
    console.error("[bank-transfers] failed to update transaction", error);
    return NextResponse.json({ error: "Failed to update bank transfer transaction" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
    if (denied) return denied;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Transaction id is required" }, { status: 400 });

    const now = new Date();
    const actor = auditActorFromDashboardSession(session!);

    await prisma.$runCommandRaw({
      update: COLLECTION,
      updates: [{
        q: { _id: { $oid: id } },
        u: { $set: { status: "DELETED", deletedAt: now, deletedBy: actor.actorId, deletedByName: actor.actorName, updatedAt: now } },
        upsert: false,
      }],
    });

    await writeAuditLog({
      ...actor,
      stream: "TEAM",
      action: "BANK_TRANSFER_DELETED",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف عملية تحويل بنكي نهائيًا`,
      entityType: "BankTransferTransaction",
      entityId: id,
      metadata: { softDelete: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[bank-transfers] failed to delete transaction", error);
    return NextResponse.json({ error: "Failed to delete bank transfer transaction" }, { status: 500 });
  }
}
