import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getUsdBaseRatesForServer } from "@/lib/exchange/rates-service";

/**
 * Turn an APPROVED bank-transfer transaction into a real Donation (current schema), marked so the
 * dashboards can show a "تحويل بنكي" hint. Historical record — this NEVER sends messages / CAPI /
 * receipts. Donors are deduped by sender name (bank transfers have no email); amount is stored in its
 * original currency (TRY) with a computed amountUSD so USD revenue dashboards include it. Idempotent:
 * one Donation per bank transaction hash.
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
};

export type BankTransferDonationResult =
  | { ok: true; donationId: string; donorId: string; duplicate: boolean }
  | { ok: false; reason: string };

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
  if (existing) return { ok: true, donationId: existing.id, donorId: existing.donorId, duplicate: true };

  // Resolve donor by sender name (dedupe by name; create a name-only TR donor when new).
  const name = input.donorName ? normalizeName(input.donorName) : "";
  const locale = input.donorLocale || "tr";
  let donorId: string | null = null;
  if (name) {
    const found = await prisma.user.findFirst({ where: { role: "DONOR", name }, select: { id: true } }).catch(() => null);
    donorId = found?.id ?? null;
  }
  if (!donorId) {
    const created = await prisma.user
      .create({ data: { name: name || "متبرع تحويل بنكي", role: "DONOR", countryCode: "TR", countryName: "Turkey", preferredLang: locale }, select: { id: true } })
      .catch(() => null);
    if (!created) return { ok: false, reason: "DONOR_CREATE_FAILED" };
    donorId = created.id;
  }

  const amountUSD = await amountToUsd(input.amount, input.currency);
  const when = parseBankDate(input.transactionDate);
  const comment = [input.project, input.note].filter(Boolean).join(" — ") || null;

  const created = await prisma.donation
    .create({
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
        donorCountryCode: "TR",
        comment,
        attribution: {
          source: "bank-transfer",
          bankId: input.bankId ?? null,
          iban: input.bankIban ?? null,
          description: input.description ?? null,
          reference: input.reference ?? null,
          note: input.note ?? null,
          project: input.project ?? null,
        } as Prisma.InputJsonValue,
        createdAt: when,
        paidAt: when,
      },
      select: { id: true },
    })
    .catch((e) => {
      console.error("createDonationFromBankTransfer failed", e);
      return null;
    });

  if (!created) return { ok: false, reason: "DONATION_CREATE_FAILED" };
  return { ok: true, donationId: created.id, donorId, duplicate: false };
}
