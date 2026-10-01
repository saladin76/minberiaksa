import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/bank-accounts/admin  the dashboard listing.
 *
 * Returns inactive rows and ignores the locale allow-list, so it sits behind
 * the dashboard permission. Currency codes come back for the list to show at a
 * glance; the identifiers themselves load on the edit page only.
 *
 * Read raw rather than through the typed client: the public list only reads
 * active rows, so a stored document that does not match the model (a missing
 * slug or holder, a null list) can hide among the inactive ones  and through
 * the typed client a single such document fails the whole listing, leaving the
 * dashboard with "Failed to fetch bank accounts" and no way to fix the row.
 * Here every field gets a safe default and an incomplete row is flagged, so it
 * shows up and can be opened, fixed or deleted.
 */

type RawId = string | { $oid?: string } | null | undefined;
type RawDoc = Record<string, unknown>;

function idOf(raw: RawId): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  return typeof raw.$oid === "string" ? raw.$oid : "";
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankAccounts");
    if (denied) return denied;

    const [banksRaw, currenciesRaw, translationsRaw] = await Promise.all([
      prisma.bankAccount.findRaw({}),
      prisma.bankAccountCurrency.findRaw({ options: { projection: { bankAccountId: 1, code: 1 } } }),
      prisma.bankAccountTranslation.findRaw({ options: { projection: { bankAccountId: 1 } } }),
    ]);

    const asDocs = (value: unknown): RawDoc[] => (Array.isArray(value) ? (value as RawDoc[]) : []);

    const codesByBank = new Map<string, string[]>();
    for (const c of asDocs(currenciesRaw)) {
      const bankId = idOf(c.bankAccountId as RawId);
      const code = str(c.code);
      if (!bankId || !code) continue;
      codesByBank.set(bankId, [...(codesByBank.get(bankId) ?? []), code]);
    }
    const translationsByBank = new Map<string, number>();
    for (const t of asDocs(translationsRaw)) {
      const bankId = idOf(t.bankAccountId as RawId);
      if (bankId) translationsByBank.set(bankId, (translationsByBank.get(bankId) ?? 0) + 1);
    }

    const items = asDocs(banksRaw)
      .map((b) => {
        const id = idOf(b._id as RawId);
        const slug = str(b.slug);
        const name = str(b.name);
        const holder = str(b.holder);
        return {
          id,
          slug,
          name: name || slug || id,
          branch: str(b.branch),
          holder,
          logo: str(b.logo),
          locales: Array.isArray(b.locales) ? (b.locales as unknown[]).filter((l): l is string => typeof l === "string") : [],
          order: typeof b.order === "number" && Number.isFinite(b.order) ? b.order : 0,
          isActive: b.isActive !== false,
          currencyCodes: codesByBank.get(id) ?? [],
          translationCount: translationsByBank.get(id) ?? 0,
          /* Missing a field the model requires: shown so it can be fixed. */
          incomplete: !slug || !name || !holder,
        };
      })
      .filter((row) => row.id)
      .sort((x, y) => x.order - y.order);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    /* The caller is an authorised admin; the reason is what lets them (or us) fix it. */
    const detail = error instanceof Error ? error.message.split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 400) : String(error);
    return NextResponse.json({ error: "Failed to fetch bank accounts", detail }, { status: 500 });
  }
}
