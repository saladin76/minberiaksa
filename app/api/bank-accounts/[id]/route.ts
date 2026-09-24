import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  BANK_ACCOUNT_WITH_CHILDREN_SELECT,
  buildBankAccountScalarPatch,
  parseBankAccountTranslations,
  parseBankCurrencies,
} from "@/lib/content/bank-account-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankAccounts");
    if (denied) return denied;

    const account = await prisma.bankAccount.findUnique({
      where: { id },
      select: BANK_ACCOUNT_WITH_CHILDREN_SELECT,
    });
    if (!account) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });

    return NextResponse.json(account);
  } catch (error) {
    console.error("Error fetching bank account:", error);
    return NextResponse.json({ error: "Failed to fetch bank account" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankAccounts");
    if (denied) return denied;

    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildBankAccountScalarPatch(body);

    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseBankAccountTranslations(body.translations);
    const currencies = parseBankCurrencies(body.currencies);

    /* Replacing the currency list with nothing would publish an account no
       donor can pay into. An absent key is fine — that is the toggle path — but
       an explicit empty list is refused. */
    if (currencies !== undefined && currencies.length === 0) {
      return NextResponse.json(
        { error: "أضف عملة واحدة على الأقل برقم حساب أو IBAN" },
        { status: 400 }
      );
    }

    // Snapshot for the audit trail: an IBAN change must be traceable to who,
    // when, and from what to what.
    const before = await prisma.bankAccount.findUnique({
      where: { id },
      select: BANK_ACCOUNT_WITH_CHILDREN_SELECT,
    });
    if (!before) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });

    const full = await prisma.bankAccount.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { bankAccountId_locale: { bankAccountId: id, locale: t.locale } },
                        create: { locale: t.locale, name: t.name, branch: t.branch, holder: t.holder },
                        update: { name: t.name, branch: t.branch, holder: t.holder },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
        /* Currencies are replaced wholesale inside the one nested write, so a
           failure leaves the old rows in place rather than none. */
        ...(currencies !== undefined
          ? { currencies: { deleteMany: {}, create: currencies } }
          : {}),
      },
      select: BANK_ACCOUNT_WITH_CHILDREN_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "BANK_ACCOUNT_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث حسابًا بنكيًا: ${full.name}`,
      entityType: "BankAccount",
      entityId: full.id,
      metadata: { before, after: full },
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating bank account:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث الحساب البنكي") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankAccounts");
    if (denied) return denied;

    const existing = await prisma.bankAccount.findUnique({
      where: { id },
      select: BANK_ACCOUNT_WITH_CHILDREN_SELECT,
    });
    if (!existing) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });

    // Translations and currencies both cascade from the schema.
    await prisma.bankAccount.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "BANK_ACCOUNT_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف حسابًا بنكيًا: ${existing.name}`,
      entityType: "BankAccount",
      entityId: existing.id,
      metadata: { before: existing },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting bank account:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف الحساب البنكي") },
      { status: 500 }
    );
  }
}
