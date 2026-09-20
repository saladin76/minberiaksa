import "server-only";

import type { BankTransferClaimStatus } from "@prisma/client";
import { pickTranslation } from "@/lib/i18n/translation-fallback";
import { isReceiptImage } from "@/lib/uploads/receipt-file-rules";
import type { ClaimWithDonation } from "./bank-transfer-claims";
import { BANK_TRANSFER_MAX_SUBMISSIONS, claimAcceptsReceipt } from "./bank-transfer-shared";

/**
 * The two JSON shapes of a claim.
 *
 * The donor's view carries no reviewer identity, no internal note and no
 * token; the dashboard's carries everything, including the donor's contact
 * details the finance team needs to reach them about a receipt.
 */

export interface DonorReceiptFile {
  url: string;
  fileName: string;
  mimeType: string;
  isImage: boolean;
  bytes: number;
  uploadedAt: string;
  submission: number;
}

export interface DonorClaimView {
  donationId: string;
  status: BankTransferClaimStatus;
  amount: number;
  currency: string;
  createdAt: string;
  lines: Array<{ title: string; amount: number }>;
  bankName: string | null;
  bankCurrency: string | null;
  senderName: string | null;
  transferDate: string | null;
  transferReference: string | null;
  receipts: DonorReceiptFile[];
  submissionCount: number;
  maxSubmissions: number;
  /** Whether the upload form should be shown at all in this state. */
  canUpload: boolean;
  receiptSubmittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  /** Set once confirmed — the settled date the receipt PDF shows. */
  paidAt: string | null;
}

function linesFor(claim: ClaimWithDonation, locale: string): Array<{ title: string; amount: number }> {
  const campaigns = claim.donation.items.map((item) => ({
    title: pickTranslation(item.campaign.translations, locale)?.title || item.campaign.title,
    amount: item.amount,
  }));
  const categories = claim.donation.categoryItems.map((item) => ({
    title: pickTranslation(item.category.translations, locale)?.name || item.category.name,
    amount: item.amount,
  }));
  return [...campaigns, ...categories].filter((line) => line.title);
}

function receiptFile(file: ClaimWithDonation["receipts"][number]): DonorReceiptFile {
  return {
    url: file.url,
    fileName: file.fileName,
    mimeType: file.mimeType,
    isImage: isReceiptImage(file.mimeType),
    bytes: file.bytes,
    uploadedAt: file.uploadedAt.toISOString(),
    submission: file.submission,
  };
}

export function serializeClaimForDonor(claim: ClaimWithDonation, locale: string): DonorClaimView {
  return {
    donationId: claim.donationId,
    status: claim.status,
    amount: claim.donation.totalAmount,
    currency: claim.donation.currency,
    createdAt: claim.donation.createdAt.toISOString(),
    lines: linesFor(claim, locale),
    bankName: claim.bankName,
    bankCurrency: claim.bankCurrency,
    senderName: claim.senderName,
    transferDate: claim.transferDate?.toISOString() ?? null,
    transferReference: claim.transferReference,
    receipts: claim.receipts.map(receiptFile),
    submissionCount: claim.submissionCount,
    maxSubmissions: BANK_TRANSFER_MAX_SUBMISSIONS,
    canUpload: claimAcceptsReceipt(claim),
    receiptSubmittedAt: claim.receiptSubmittedAt?.toISOString() ?? null,
    reviewedAt: claim.reviewedAt?.toISOString() ?? null,
    rejectionReason: claim.rejectionReason,
    paidAt: claim.donation.paidAt?.toISOString() ?? null,
  };
}

export interface AdminClaimView {
  id: string;
  donationId: string;
  status: BankTransferClaimStatus;
  createdAt: string;
  updatedAt: string;
  donation: {
    amount: number;
    totalAmount: number;
    amountUSD: number | null;
    currency: string;
    teamSupport: number;
    fees: number;
    status: string;
    paidAt: string | null;
    createdAt: string;
    locale: string | null;
    donorCountryCode: string | null;
    lines: Array<{ kind: "campaign" | "category"; id: string; title: string; amount: number; amountUSD: number | null; image: string | null }>;
  };
  donor: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    countryCode: string | null;
    countryName: string | null;
    preferredLang: string | null;
    image: string | null;
    memberSince: string;
  };
  bankSlug: string | null;
  bankName: string | null;
  bankCurrency: string | null;
  senderName: string | null;
  transferDate: string | null;
  transferReference: string | null;
  donorNote: string | null;
  receipts: DonorReceiptFile[];
  submissionCount: number;
  maxSubmissions: number;
  receiptSubmittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  adminNote: string | null;
  /** The donor's own status page — for support to send them. */
  donorPagePath: string;
}

export function serializeClaimForAdmin(claim: ClaimWithDonation): AdminClaimView {
  const d = claim.donation;
  const lines: AdminClaimView["donation"]["lines"] = [
    ...d.items.map((item) => ({
      kind: "campaign" as const,
      id: item.campaign.id,
      title: item.campaign.title,
      amount: item.amount,
      amountUSD: item.amountUSD ?? null,
      image: item.campaign.images?.[0] ?? null,
    })),
    ...d.categoryItems.map((item) => ({
      kind: "category" as const,
      id: item.category.id,
      title: item.category.name,
      amount: item.amount,
      amountUSD: item.amountUSD ?? null,
      image: item.category.image ?? null,
    })),
  ];
  const pageLocale = d.locale ?? d.donor.preferredLang ?? "ar";
  return {
    id: claim.id,
    donationId: claim.donationId,
    status: claim.status,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
    donation: {
      amount: d.amount,
      totalAmount: d.totalAmount,
      amountUSD: d.amountUSD ?? null,
      currency: d.currency,
      teamSupport: d.teamSupport,
      fees: d.fees,
      status: d.status,
      paidAt: d.paidAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      locale: d.locale ?? null,
      donorCountryCode: d.donorCountryCode ?? null,
      lines,
    },
    donor: {
      id: d.donor.id,
      name: d.donor.name,
      email: d.donor.email,
      phone: d.donor.phone,
      countryCode: d.donor.countryCode,
      countryName: d.donor.countryName,
      preferredLang: d.donor.preferredLang,
      image: d.donor.image,
      memberSince: d.donor.createdAt.toISOString(),
    },
    bankSlug: claim.bankSlug,
    bankName: claim.bankName,
    bankCurrency: claim.bankCurrency,
    senderName: claim.senderName,
    transferDate: claim.transferDate?.toISOString() ?? null,
    transferReference: claim.transferReference,
    donorNote: claim.donorNote,
    receipts: claim.receipts.map(receiptFile),
    submissionCount: claim.submissionCount,
    maxSubmissions: BANK_TRANSFER_MAX_SUBMISSIONS,
    receiptSubmittedAt: claim.receiptSubmittedAt?.toISOString() ?? null,
    reviewedAt: claim.reviewedAt?.toISOString() ?? null,
    reviewedByName: claim.reviewedByName,
    rejectionReason: claim.rejectionReason,
    adminNote: claim.adminNote,
    donorPagePath: `/${pageLocale}/payment-pending/${claim.donationId}?t=${claim.accessToken}`,
  };
}
