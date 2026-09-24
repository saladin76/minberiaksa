import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getUsdBaseRatesForServer } from "@/lib/exchange/rates-service";
import { recomputeCampaignCurrentAmount } from "@/lib/campaign/current-amount";

/**
 * Turn an APPROVED bank-transfer transaction into a real Donation (current schema), marked so the
 * dashboards can show a "تحويل بنكي" hint. Historical record — this NEVER sends messages / CAPI /
 * receipts. Amount is stored in its original currency with a computed amountUSD so USD revenue
 * dashboards include it. Idempotent: one Donation per bank transaction hash.
 *
 * Donor: never matched by name alone — two people called «محمد أحمد» are two people. The reviewer
 * either picks the donor (`donorUserId`), gives an exact email/phone (`donorContact`), or a new
 * donor is created for this sender. Country is left empty: the bank's location is not the donor's.
 *
 * Project: when the reviewer picks a project (`campaignId`) a DonationItem is written and the
 * project's total is recomputed, exactly as for any other paid donation. Without one the gift is
 * a general donation; the free-text project note is kept in `attribution` for reference only.
 */

export const BANK_TRANSFER_PROVIDER = "BANK_TRANSFER";
export const BANK_ORDER_PREFIX = "BANK:";

export type BankTransferDonationInput = {
  transactionHash: string;
  donorName: string | null;
  amount: number;
  currency: string;
  transactionDate: string | null;
  donorLocale?: string | null;
  project?: string | null;
  note?: string | null;
  description?: string | null;
  reference?: string | null;
  bankId?: string | null;
  bankIban?: string | null;
  /** An existing donor the reviewer chose explicitly. */
  donorUserId?: string | null;
  /** Exact email or phone of an existing donor. */
  donorContact?: string | null;
  /** The project this transfer funds. Updates the project's total. */
  campaignId?: string | null;
};

export type BankTransferDonationFailure =
  | "DATABASE_UNAVAILABLE"
  | "MISSING_HASH"
  | "INVALID_AMOUNT"
  | "DONOR_NOT_FOUND"
  | "DONOR_CONTACT_NOT_FOUND"
  | "DONOR_CONTACT_AMBIGUOUS"
  | "CAMPAIGN_NOT_FOUND"
  | "DONOR_CREATE_FAILED"
  | "DONATION_CREATE_FAILED";

export type BankTransferDonationResult =
  | { ok: true; donationId: string; donorId: string; duplicate: boolean; campaignId: string | null }
  | { ok: false; reason: BankTransferDonationFailure };

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Accept ISO or Turkish "dd.mm.yyyy HH:mm[:ss]"; fall back to now. */
function parseBankDate(value: string | null): Date {
  if (!value) return new Date();
  const m = value.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = m;
    const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const iso = new Date(value);
  return Number.isNaN(iso.getTime()) ? new Date() : iso;
}

/** Convert an amount in `currency` to USD using the USD-base rates (rates[CUR] = units per 1 USD). */
async function amountToUsd(amount: number, currency: string): Promise<number | null> {
  const cur = (currency || "TRY").toUpperCase();
  if (cur === "USD") return Math.round(amount * 100) / 100;
  try {
    const rates = await getUsdBaseRatesForServer();
    const r = rates[cur];
    if (!r || r <= 0) return null;
    return Math.round((amount / r) * 100) / 100;
  } catch {
    return null;
  }
}

export async function createDonationFromBankTransfer(input: BankTransferDonationInput): Promise<BankTransferDonationResult> {
  if (!process.env.DATABASE_URL) return { ok: false, reason: "DATABASE_UNAVAILABLE" };
  if (!input.transactionHash) return { ok: false, reason: "MISSING_HASH" };
  if (!input.amount || input.amount <= 0) return { ok: false, reason: "INVALID_AMOUNT" };

  const providerOrderId = `${BANK_ORDER_PREFIX}${input.transactionHash}`;

  // Idempotency — one donation per bank transaction hash (safe on re-approval).
  const existing = await prisma.donation
    .findFirst({ where: { provider: BANK_TRANSFER_PROVIDER, providerOrderId }, select: { id: true, donorId: true } })
    .catch(() => null);
  if (existing) return { ok: true, donationId: existing.id, donorId: existing.donorId, duplicate: true, campaignId: null };

  const name = input.donorName ? normalizeName(input.donorName) : "";
  const locale = input.donorLocale || "tr";

  // Project first: refusing a bad project must not leave a donor row behind.
  let campaignId: string | null = null;
  if (input.campaignId) {
    const campaign = OBJECT_ID.test(input.campaignId)
      ? await prisma.campaign
          .findUnique({ where: { id: input.campaignId }, select: { id: true, isDeleted: true } })
          .catch(() => null)
      : null;
    if (!campaign || campaign.isDeleted === true) return { ok: false, reason: "CAMPAIGN_NOT_FOUND" };
    campaignId = campaign.id;
  }

  // Donor: explicit choice → exact contact → a new donor. Never by name.
  let donorId: string | null = null;
  if (input.donorUserId) {
    const found = OBJECT_ID.test(input.donorUserId)
      ? await prisma.user.findUnique({ where: { id: input.donorUserId }, select: { id: true } }).catch(() => null)
      : null;
    if (!found) return { ok: false, reason: "DONOR_NOT_FOUND" };
    donorId = found.id;
  } else if (input.donorContact?.trim()) {
    const contact = input.donorContact.trim();
    const where = contact.includes("@")
      ? { email: { equals: contact, mode: "insensitive" as const } }
      : { phone: contact.replace(/[\s()-]/g, "") };
    const matches = await prisma.user.findMany({ where, select: { id: true }, take: 2 }).catch(() => []);
    if (matches.length === 0) return { ok: false, reason: "DONOR_CONTACT_NOT_FOUND" };
    if (matches.length > 1) return { ok: false, reason: "DONOR_CONTACT_AMBIGUOUS" };
    donorId = matches[0].id;
  }
  if (!donorId) {
    const created = await prisma.user
      .create({ data: { name: name || "متبرع تحويل بنكي", role: "DONOR", preferredLang: locale }, select: { id: true } })
      .catch(() => null);
    if (!created) return { ok: false, reason: "DONOR_CREATE_FAILED" };
    donorId = created.id;
  }

  const amountUSD = await amountToUsd(input.amount, input.currency);
  const when = parseBankDate(input.transactionDate);
  const comment = [input.project, input.note].filter(Boolean).join(" — ") || null;

  const created = await prisma
    .$transaction(async (tx) => {
      const donation = await tx.donation.create({
      data: {
        amount: input.amount,
        amountUSD,
        currency: (input.currency || "TRY").toUpperCase(),
        totalAmount: input.amount,
        status: "PAID",
        locale,
        provider: BANK_TRANSFER_PROVIDER,
        providerOrderId,
        providerTxnResult: "Success",
        donorId,
        donorCountryCode: null,
        comment,
        attribution: {
          source: "bank-transfer",
          bankId: input.bankId ?? null,
          iban: input.bankIban ?? null,
          description: input.description ?? null,
          reference: input.reference ?? null,
          note: input.note ?? null,
          project: input.project ?? null,
          campaignId,
        } as Prisma.InputJsonValue,
        createdAt: when,
        paidAt: when,
        ...(campaignId
          ? { items: { create: [{ campaignId, amount: input.amount, amountUSD }] } }
          : {}),
      },
      select: { id: true },
      });
      // Same baseline-preserving recompute every other paid donation goes through.
      if (campaignId) await recomputeCampaignCurrentAmount(tx, campaignId);
      return donation;
    })
    .catch((e) => {
      console.error("createDonationFromBankTransfer failed", e);
      return null;
    });

  if (!created) return { ok: false, reason: "DONATION_CREATE_FAILED" };
  return { ok: true, donationId: created.id, donorId, duplicate: false, campaignId };
}
