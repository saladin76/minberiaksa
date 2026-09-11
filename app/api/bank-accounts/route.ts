import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  BANK_ACCOUNT_WITH_CHILDREN_SELECT,
  buildBankAccountScalars,
  parseBankAccountTranslations,
  parseBankCurrencies,
} from "@/lib/content/bank-account-write";

/**
 * GET  /api/bank-accounts — the public list for one locale, with currencies.
 *      `locales` is an allow-list and empty means every locale.
 * POST /api/bank-accounts — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const rows = await prisma.bankAccount.findMany({
      where: {
        isActive: true,
        OR: [{ locales: { isEmpty: true } }, { locales: { has: locale } }],
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        branch: true,
        swift: true,
        holder: true,
        logo: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, name: true, branch: true, holder: true },
        },
        currencies: { select: { code: true, accountNo: true, extNo: true, iban: true } },
      },
    });

    const items = rows.map((b) => {
      const t = pickTranslation(b.translations, locale);
      return {
        id: b.id,
        slug: b.slug,
        name: t?.name ?? b.name,
        branch: t?.branch || b.branch || "",
        holder: t?.holder || b.holder,
        swift: b.swift ?? "",
        logo: b.logo ?? "",
        order: b.order,
        currencies: b.currencies.map((c) => ({
          code: c.code,
          accountNo: c.accountNo ?? "",
          extNo: c.extNo ?? "",
          iban: c.iban ?? "",
        })),
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    return NextResponse.json({ error: "Failed to fetch bank accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildBankAccountScalars(data);
    if (!scalars.name) {
      return NextResponse.json({ error: "اسم البنك بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }
    if (!scalars.holder) {
      return NextResponse.json({ error: "اسم صاحب الحساب مطلوب" }, { status: 400 });
    }

    const currencies = parseBankCurrencies(data.currencies) ?? [];
    /* An account with no usable currency row gives a donor nothing to transfer
       to — and publishing one is exactly the failure the schema warns about. */
    if (currencies.length === 0) {
      return NextResponse.json(
        { error: "أضف عملة واحدة على الأقل برقم حساب أو IBAN" },
        { status: 400 }
      );
    }

    const { write } = parseBankAccountTranslations(data.translations);

    const full = await prisma.bankAccount.create({
      data: {
        ...scalars,
        ...(write.length ? { translations: { create: write } } : {}),
        currencies: { create: currencies },
      },
      select: BANK_ACCOUNT_WITH_CHILDREN_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "BANK_ACCOUNT_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أضاف حسابًا بنكيًا: ${full.name} (${currencies.map((c) => c.code).join("، ")})`,
      entityType: "BankAccount",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating bank account:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء الحساب البنكي") },
      { status: 500 }
    );
  }
}
