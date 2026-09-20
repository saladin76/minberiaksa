import "server-only";

import { randomBytes } from "node:crypto";
import type { BankTransferClaim, Prisma } from "@prisma/client";
import type { UploadApiResponse } from "cloudinary";
import cloudinary from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { dispatchDonationPaid } from "@/lib/events/dispatch";
import { tgNotify, htmlEscape } from "@/lib/telegram/client";
import { isReceiptImage } from "@/lib/uploads/receipt-file-rules";
import { sendBankTransferEmail } from "./bank-transfer-emails";
import { BANK_TRANSFER_MAX_SUBMISSIONS, BANK_TRANSFER_PROVIDER, BANK_TRANSFER_REJECTED_MARKER, safeMoney } from "./bank-transfer-shared";

export { BANK_TRANSFER_MAX_SUBMISSIONS, BANK_TRANSFER_PROVIDER, BANK_TRANSFER_REJECTED_MARKER, CLAIM_STATUS_ORDER, claimAcceptsReceipt, claimStatusPath, safeMoney } from "./bank-transfer-shared";

/**
 * Bank-transfer donations: the receipt a donor uploads and the finance review
 * that turns it into a settled donation.
 *
 * `DONATION_LOGIC_SPEC §3` is the contract this implements:
 *
 *   Awaiting receipt → Receipt uploaded → Under review → Confirmed | Rejected
 *
 *  - the order is created at checkout as a `PAID` donation with `paidAt` unset,
 *    which is the site's existing "قيد التأكيد" state: every revenue figure,
 *    campaign total and donor total filters on `paidAt`, so an unconfirmed
 *    transfer is visible to the team but counted nowhere;
 *  - a finance officer is the only one who can move it on, from the dashboard;
 *  - confirming stamps `paidAt` and rolls the lines into campaign / category
 *    totals inside one transaction, exactly as the Stripe webhook does, then
 *    fires the same post-payment pipeline (receipt email, Telegram, CAPI,
 *    first-donation) through `dispatchDonationPaid`;
 *  - rejecting records the reason, tells the donor, and lets them upload again
 *    up to `BANK_TRANSFER_MAX_SUBMISSIONS` times; while rejected the donation
 *    is `FAILED` so it reads truthfully on every table.
 *
 * Distinct from `bank-transfer-donation.ts`, which imports approved lines
 * from a bank *statement* into historical donations with no donor interaction.
 */

const CLOUDINARY_FOLDER = "transfer-receipts";

export type ClaimActor = { actorId: string; actorName: string | null | undefined; actorRole: string };

/** A claim with the donation it belongs to, as every path here reads it. */
export type ClaimWithDonation = Prisma.BankTransferClaimGetPayload<{ include: { donation: { include: typeof DONATION_INCLUDE } } }>;

export const DONATION_INCLUDE = {
  donor: { select: { id: true, name: true, email: true, phone: true, countryCode: true, countryName: true, preferredLang: true, image: true, createdAt: true } },
  /* Every translation rather than the locale's two: the same row is read for
     the donor (their locale) and for the dashboard (Arabic), and the list is
     a handful of short titles. */
  items: { include: { campaign: { select: { id: true, title: true, slug: true, images: true, translations: { select: { locale: true, title: true } } } } } },
  categoryItems: { include: { category: { select: { id: true, name: true, slug: true, image: true, translations: { select: { locale: true, name: true } } } } } },
} as const;

export function newAccessToken(): string {
  return randomBytes(24).toString("hex");
}

/* ------------------------------------------------------------------------ */
/* Creation (called inside the checkout transaction)                          */
/* ------------------------------------------------------------------------ */

export interface CreateClaimInput {
  donationId: string;
  bankSlug?: string | null;
  bankName?: string | null;
  bankCurrency?: string | null;
}

export async function createBankTransferClaim(tx: Prisma.TransactionClient, input: CreateClaimInput): Promise<BankTransferClaim> {
  return tx.bankTransferClaim.create({
    data: {
      donationId: input.donationId,
      accessToken: newAccessToken(),
      bankSlug: input.bankSlug || null,
      bankName: input.bankName || null,
      bankCurrency: input.bankCurrency ? input.bankCurrency.toUpperCase() : null,
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                    */
/* ------------------------------------------------------------------------ */

export async function findClaimByDonation(donationId: string): Promise<ClaimWithDonation | null> {
  return prisma.bankTransferClaim.findUnique({
    where: { donationId },
    include: { donation: { include: DONATION_INCLUDE } },
  });
}

export async function findClaimById(id: string): Promise<ClaimWithDonation | null> {
  return prisma.bankTransferClaim.findUnique({
    where: { id },
    include: { donation: { include: DONATION_INCLUDE } },
  });
}

/**
 * Whether a request from the public site may see and act on this claim.
 *
 * A signed-in donor proves ownership through the session; a guest has no
 * session and proves it with the token from the redirect / the emails. The
 * token also works for a signed-in donor whose account is not the one the
 * order was made under (the guest checkout matched an existing email).
 */
export function donorMayAccessClaim(claim: ClaimWithDonation, sessionUserId: string | null | undefined, token: string | null | undefined): boolean {
  if (sessionUserId && sessionUserId === claim.donation.donorId) return true;
  if (token && token.length >= 32 && token === claim.accessToken) return true;
  return false;
}

/* ------------------------------------------------------------------------ */
/* Donor: submit a receipt                                                    */
/* ------------------------------------------------------------------------ */

export interface SubmitReceiptInput {
  claim: ClaimWithDonation;
  file: { buffer: Buffer; mimeType: string; fileName: string };
  senderName?: string | null;
  transferDate?: Date | null;
  transferReference?: string | null;
  donorNote?: string | null;
  /** Locale of the page the donor is on — the emails follow it. */
  locale: string;
  /** Absolute origin for the links in the emails and the Telegram card. */
  origin: string;
}

export type SubmitReceiptResult =
  | { ok: true; claim: ClaimWithDonation }
  | { ok: false; reason: "CLOSED" | "NO_ATTEMPTS_LEFT" | "UPLOAD_FAILED" };

function uploadToCloudinary(buffer: Buffer, mimeType: string, fileName: string): Promise<UploadApiResponse> {
  const isImage = isReceiptImage(mimeType);
  /* Strip the extension from the public id: Cloudinary appends its own for raw
     resources, and `receipt.pdf.pdf` is what you get otherwise. */
  const base = (fileName || "receipt").replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60) || "receipt";
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        resource_type: isImage ? "image" : "raw",
        public_id: `${Date.now()}-${base}`,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Cloudinary returned no result"));
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function submitBankTransferReceipt(input: SubmitReceiptInput): Promise<SubmitReceiptResult> {
  const { claim } = input;
  if (claim.status === "CONFIRMED" || claim.status === "UNDER_REVIEW") return { ok: false, reason: "CLOSED" };
  if (claim.submissionCount >= BANK_TRANSFER_MAX_SUBMISSIONS) return { ok: false, reason: "NO_ATTEMPTS_LEFT" };

  let uploaded: UploadApiResponse;
  try {
    uploaded = await uploadToCloudinary(input.file.buffer, input.file.mimeType, input.file.fileName);
  } catch (error) {
    console.error("[bank-transfer] receipt upload failed", error);
    return { ok: false, reason: "UPLOAD_FAILED" };
  }

  const now = new Date();
  const submission = claim.submissionCount + 1;

  /* Only the two writes sit inside the transaction; the full read for the
     response happens after. Atlas answers in ~0.5s per round trip, and the
     include-laden read alone was enough to blow Prisma's 5s default. */
  await prisma.$transaction(async (tx) => {
    await tx.bankTransferClaim.update({
      where: { id: claim.id },
      data: {
        status: "UNDER_REVIEW",
        submissionCount: submission,
        receiptSubmittedAt: now,
        senderName: input.senderName?.trim() || claim.senderName || null,
        transferDate: input.transferDate ?? claim.transferDate ?? null,
        transferReference: input.transferReference?.trim() || claim.transferReference || null,
        donorNote: input.donorNote?.trim() || null,
        /* A rejection is answered by this upload; the reviewer's note stays. */
        rejectionReason: null,
        reviewedAt: null,
        reviewedById: null,
        reviewedByName: null,
        receipts: {
          push: {
            url: uploaded.secure_url,
            publicId: uploaded.public_id,
            resourceType: uploaded.resource_type,
            mimeType: input.file.mimeType,
            bytes: input.file.buffer.byteLength,
            fileName: input.file.fileName.slice(0, 160),
            uploadedAt: now,
            submission,
          },
        },
      },
      select: { id: true },
    });

    /* A re-upload after a rejection puts the donation back to "قيد التأكيد";
       a first upload leaves it exactly as checkout created it. */
    if (claim.donation.status === "FAILED") {
      await tx.donation.update({
        where: { id: claim.donationId },
        data: { status: "PAID", providerTxnResult: "Pending", providerErrorMessage: null },
      });
    }
  }, { timeout: 30_000, maxWait: 10_000 });

  const updated = (await findClaimById(claim.id))!;
  const donor = updated.donation.donor;
  const amount = safeMoney(updated.donation.totalAmount, updated.donation.currency, "en");
  await writeAuditLog({
    actorId: donor.id,
    actorName: donor.name,
    actorRole: "DONOR",
    action: "BANK_TRANSFER_RECEIPT_UPLOADED",
    messageAr: `${donor.name ?? "متبرع"} رفع إيصال تحويل بنكي (${amount})${submission > 1 ? ` — المحاولة ${submission}` : ""}`,
    entityType: "Donation",
    entityId: updated.donationId,
    metadata: { claimId: updated.id, submission, bytes: input.file.buffer.byteLength, mimeType: input.file.mimeType },
    stream: "DONOR",
  });

  void notifyTeamOfReceipt(updated, input.origin);
  void sendBankTransferEmail("RECEIPT_RECEIVED", updated, { locale: input.locale, origin: input.origin });

  return { ok: true, claim: updated };
}

/* ------------------------------------------------------------------------ */
/* Finance: confirm / reject                                                  */
/* ------------------------------------------------------------------------ */

export type ReviewResult =
  | { ok: true; claim: ClaimWithDonation }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_CONFIRMED" | "NO_RECEIPT" };

/**
 * The money is on the statement. Settle the donation the way the gateways do
 * — `paidAt`, provider fields and the campaign / category increments in one
 * transaction, guarded on `paidAt` so a double click cannot count it twice —
 * then run the ordinary paid pipeline.
 */
export async function confirmBankTransferClaim(claimId: string, actor: ClaimActor, opts: { adminNote?: string | null; origin: string }): Promise<ReviewResult> {
  const claim = await findClaimById(claimId);
  if (!claim) return { ok: false, reason: "NOT_FOUND" };
  if (claim.status === "CONFIRMED" || claim.donation.paidAt) return { ok: false, reason: "ALREADY_CONFIRMED" };

  const now = new Date();
  const settled = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.donation.findUnique({ where: { id: claim.donationId }, include: { items: true, categoryItems: true } });
      if (!fresh || fresh.paidAt != null) return false;

      await tx.donation.update({
        where: { id: fresh.id },
        data: {
          status: "PAID",
          paidAt: now,
          provider: BANK_TRANSFER_PROVIDER,
          providerOrderId: fresh.providerOrderId ?? fresh.id,
          providerTxnResult: "Success",
          providerErrorMessage: null,
          providerAuthCode: claim.transferReference ?? null,
        },
      });
      for (const item of fresh.items) {
        await tx.campaign.update({ where: { id: item.campaignId }, data: { currentAmount: { increment: item.amountUSD ?? item.amount } } });
      }
      for (const item of fresh.categoryItems) {
        await tx.category.update({ where: { id: item.categoryId }, data: { currentAmount: { increment: item.amountUSD ?? item.amount } } });
      }
      await tx.bankTransferClaim.update({
        where: { id: claim.id },
        data: {
          status: "CONFIRMED",
          reviewedAt: now,
          reviewedById: actor.actorId,
          reviewedByName: actor.actorName ?? null,
          rejectionReason: null,
          ...(opts.adminNote !== undefined ? { adminNote: opts.adminNote?.trim() || null } : {}),
        },
      });
      return true;
    },
    { timeout: 30_000, maxWait: 10_000 }
  );

  if (!settled) return { ok: false, reason: "ALREADY_CONFIRMED" };

  const updated = (await findClaimById(claimId))!;
  const amount = safeMoney(updated.donation.totalAmount, updated.donation.currency, "en");
  await writeAuditLog({
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    action: "BANK_TRANSFER_CONFIRMED",
    messageAr: `${actor.actorName ?? "مسؤول"} أكّد تحويلًا بنكيًا من ${updated.donation.donor.name ?? "متبرع"} (${amount})`,
    entityType: "Donation",
    entityId: updated.donationId,
    metadata: { claimId: updated.id, amountUSD: updated.donation.amountUSD ?? null, submissions: updated.submissionCount },
    stream: "TEAM",
  });

  /* The same pipeline a card payment runs: DONATION_PAID triggers (the
     official receipt email), Telegram, server conversions, FIRST_DONATION. */
  void dispatchDonationPaid(updated.donationId);
  void sendBankTransferEmail("CONFIRMED", updated, { locale: updated.donation.locale ?? updated.donation.donor.preferredLang ?? "en", origin: opts.origin });

  return { ok: true, claim: updated };
}

/**
 * The receipt does not match anything received. The donation reads FAILED so
 * no table shows it as pending money; the reason travels to the donor, who
 * may upload again while attempts remain.
 */
export async function rejectBankTransferClaim(claimId: string, actor: ClaimActor, input: { reason: string; adminNote?: string | null; origin: string }): Promise<ReviewResult> {
  const claim = await findClaimById(claimId);
  if (!claim) return { ok: false, reason: "NOT_FOUND" };
  if (claim.status === "CONFIRMED" || claim.donation.paidAt) return { ok: false, reason: "ALREADY_CONFIRMED" };

  const now = new Date();
  const reason = input.reason.trim();
  await prisma.$transaction(async (tx) => {
    await tx.bankTransferClaim.update({
      where: { id: claim.id },
      data: {
        status: "REJECTED",
        reviewedAt: now,
        reviewedById: actor.actorId,
        reviewedByName: actor.actorName ?? null,
        rejectionReason: reason,
        ...(input.adminNote !== undefined ? { adminNote: input.adminNote?.trim() || null } : {}),
      },
    });
    await tx.donation.update({
      where: { id: claim.donationId },
      data: {
        status: "FAILED",
        providerTxnResult: "Rejected",
        providerErrorMessage: `${BANK_TRANSFER_REJECTED_MARKER} — ${reason}`,
      },
    });
  }, { timeout: 30_000, maxWait: 10_000 });

  const updated = (await findClaimById(claimId))!;
  const amount = safeMoney(updated.donation.totalAmount, updated.donation.currency, "en");
  await writeAuditLog({
    actorId: actor.actorId,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    action: "BANK_TRANSFER_REJECTED",
    messageAr: `${actor.actorName ?? "مسؤول"} رفض إيصال تحويل بنكي من ${updated.donation.donor.name ?? "متبرع"} (${amount}) — ${reason}`,
    entityType: "Donation",
    entityId: updated.donationId,
    metadata: { claimId: updated.id, reason, submissions: updated.submissionCount },
    stream: "TEAM",
  });

  void sendBankTransferEmail("REJECTED", updated, { locale: updated.donation.locale ?? updated.donation.donor.preferredLang ?? "en", origin: input.origin });

  return { ok: true, claim: updated };
}

/** Internal note only; no state change, no donor notification. */
export async function annotateBankTransferClaim(claimId: string, adminNote: string | null): Promise<void> {
  await prisma.bankTransferClaim.update({ where: { id: claimId }, data: { adminNote: adminNote?.trim() || null } });
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------ */

async function notifyTeamOfReceipt(claim: ClaimWithDonation, origin: string): Promise<void> {
  try {
    const d = claim.donation;
    const lines = [
      ...d.items.map((i) => i.campaign.title),
      ...d.categoryItems.map((i) => i.category.name),
    ].filter(Boolean);
    const amount = safeMoney(d.totalAmount, d.currency, "en");
    const text = [
      `🏦 <b>إيصال تحويل بنكي جديد بانتظار المراجعة</b>`,
      ``,
      `👤 ${htmlEscape(d.donor.name ?? "—")}${d.donor.email ? ` · ${htmlEscape(d.donor.email)}` : ""}`,
      `💵 <b>${htmlEscape(amount)}</b>${d.amountUSD != null && d.currency !== "USD" ? ` (≈ $${Math.round(d.amountUSD)})` : ""}`,
      claim.bankName ? `🏛 ${htmlEscape(claim.bankName)}${claim.bankCurrency ? ` · ${claim.bankCurrency}` : ""}` : null,
      lines.length ? `🎯 ${htmlEscape(lines.join("، "))}` : null,
      claim.transferReference ? `🔖 ${htmlEscape(claim.transferReference)}` : null,
      claim.submissionCount > 1 ? `🔁 المحاولة ${claim.submissionCount}` : null,
      ``,
      `<a href="${origin}/dashboard/transfer-receipts?claim=${claim.id}">فتح في لوحة التحكم</a>`,
    ].filter((line): line is string => line !== null);
    await tgNotify(text.join("\n"), { silent: false, disablePreview: true });
  } catch (error) {
    console.error("[bank-transfer] telegram notify failed", error);
  }
}
