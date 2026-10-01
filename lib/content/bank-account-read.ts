import "server-only";

import { prisma } from "@/lib/prisma";
import { BANK_ACCOUNT_WITH_CHILDREN_SELECT } from "./bank-account-write";

/**
 * One bank account for the dashboard (edit, save, delete), even when its
 * stored document does not match the model.
 *
 * Read through the typed client first. A document missing a field the model
 * requires (slug, name, holder) makes that read throw, which used to lock the
 * row: it could not be opened to fix, saved, or deleted. Then it is read raw,
 * every field given a safe default, so the dashboard can open it and the next
 * save writes it back whole.
 */

type RawDoc = Record<string, unknown>;
type RawId = string | { $oid?: string } | null | undefined;

const idOf = (raw: RawId): string => (!raw ? "" : typeof raw === "string" ? raw : typeof raw.$oid === "string" ? raw.$oid : "");
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const optStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const docs = (value: unknown): RawDoc[] => (Array.isArray(value) ? (value as RawDoc[]) : []);

export type AdminBankAccount = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
  swift: string | null;
  holder: string;
  logo: string | null;
  locales: string[];
  order: number;
  isActive: boolean;
  translations: Array<{ locale: string; name: string; branch: string | null; holder: string | null }>;
  currencies: Array<{ id: string; code: string; accountNo: string | null; extNo: string | null; iban: string | null }>;
};

export async function findBankAccountForAdmin(id: string): Promise<AdminBankAccount | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return null;
  try {
    return await prisma.bankAccount.findUnique({ where: { id }, select: BANK_ACCOUNT_WITH_CHILDREN_SELECT });
  } catch (error) {
    console.error("[bank-accounts] typed read failed, reading raw:", id, error instanceof Error ? error.message : error);
  }

  const oid = { $oid: id };
  const [banks, currencies, translations] = await Promise.all([
    prisma.bankAccount.findRaw({ filter: { _id: oid } }),
    prisma.bankAccountCurrency.findRaw({ filter: { bankAccountId: oid } }),
    prisma.bankAccountTranslation.findRaw({ filter: { bankAccountId: oid } }),
  ]);
  const b = docs(banks)[0];
  if (!b) return null;

  return {
    id,
    slug: str(b.slug),
    name: str(b.name),
    branch: optStr(b.branch),
    swift: optStr(b.swift),
    holder: str(b.holder),
    logo: optStr(b.logo),
    locales: Array.isArray(b.locales) ? (b.locales as unknown[]).filter((l): l is string => typeof l === "string") : [],
    order: typeof b.order === "number" && Number.isFinite(b.order) ? b.order : 0,
    isActive: b.isActive !== false,
    translations: docs(translations)
      .map((t) => ({ locale: str(t.locale), name: str(t.name), branch: optStr(t.branch), holder: optStr(t.holder) }))
      .filter((t) => t.locale),
    currencies: docs(currencies)
      .map((c) => ({ id: idOf(c._id as RawId), code: str(c.code), accountNo: optStr(c.accountNo), extNo: optStr(c.extNo), iban: optStr(c.iban) }))
      .filter((c) => c.id && c.code),
  };
}
