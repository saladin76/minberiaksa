import { donationProviderWhere } from "@/lib/dashboard/donation-provider-filter";
import { loadReportSubscriptions } from "@/lib/dashboard/report-subscriptions";
import { dt, withReportLanguage } from "@/lib/dashboard/report-i18n";
/**
 * GET /api/admin/monthly/export
 *
 * XLSX (default) or CSV export covering recurring plans (daily / every Friday / monthly)
 * AND the charges they have generated. Two sheets + the standard cover summary:
 *   • التبرعات  every charge against a recurring plan (filtered)
 *   • الاشتراكات  plan roster (active/paused/cancelled/payment failed) with charge totals,
 *     cadence and monthly-equivalent amount
 *
 * Filters mirror the recurring dashboard (/dashboard/monthly):
 *   format, start, end, categoryId, campaignId, userId, status (donation),
 *   subStatus (subscription: ACTIVE|PAUSED|CANCELLED|PAYMENT_FAILED|all),
 *   frequency (DAILY|FRIDAY|MONTHLY|all), locale, country, sortBy, sortOrder.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { donationStatusWhere } from "@/lib/dashboard/donation-usd-revenue";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  buildDonationExport,
  buildContentDisposition,
  type DonationExportRow,
  type ExportFilterDescriptor,
  type ExportFormat,
} from "@/lib/dashboard/donation-export";
import { istanbulDateKeysToUtcRange } from "@/lib/admin/istanbul-calendar";
import {
  donationFrequencyWhere,
  loadSubscriptionFrequencies,
  parseFrequencyParam,
  subscriptionFrequencyWhere,
} from "@/lib/dashboard/recurring-frequency-filter";
import { DASH_LOCALE_COOKIE, parseDashLocale } from "@/lib/dashboard/i18n";

const FREQUENCY_LABEL_AR = { get DAILY() { return dt("يومي"); }, get FRIDAY() { return dt("تبرع كل جمعة"); }, get MONTHLY() { return dt("شهري"); } } as const;

async function localizedGET(request: NextRequest) {
  // Sheet names, headers and labels in the dashboard's interface language.
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "monthly");
    if (denied) return denied;
    const exportDenied = requireAdminOrDashboardPermission(session, "reportsExport");
    if (exportDenied) return exportDenied;

    const sp = request.nextUrl.searchParams;
    const format: ExportFormat = sp.get("format") === "csv" ? "csv" : "xlsx";
    const campaignId = sp.get("campaignId");
    const userId = sp.get("userId");
    const categoryId = sp.get("categoryId");
    const startParam = sp.get("start");
    const endParam = sp.get("end");
    const sortBy = (sp.get("sortBy") || "date") as "date" | "amount";
    const sortOrder = (sp.get("sortOrder") || "desc") as "asc" | "desc";
    const status = "PAID";                  // donation status
    const subStatusRaw = (sp.get("subStatus") || "all").toUpperCase();
    const locale = sp.get("locale")?.trim() ?? null;
    const provider = sp.get("provider");
    const country = sp.get("country")?.trim() ?? null;
    const frequency = parseFrequencyParam(sp.get("frequency"));
    const limit = Math.min(parseInt(sp.get("limit") || "20000", 10) || 20000, 50000);

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startParam && endParam) {
      const r = istanbulDateKeysToUtcRange(startParam, endParam);
      dateFilter.gte = r.startDate;
      dateFilter.lte = r.endDate;
    } else if (startParam) {
      dateFilter.gte = istanbulDateKeysToUtcRange(startParam, startParam).startDate;
    } else if (endParam) {
      dateFilter.lte = istanbulDateKeysToUtcRange(endParam, endParam).endDate;
    }

    // ── Donation filter (recurring only) ──────────────────────────────────────
    const donationWhere: Prisma.DonationWhereInput = {
      subscriptionId: { not: null },
      ...donationFrequencyWhere(frequency),
      ...(campaignId && campaignId !== "all" && { items: { some: { campaignId } } }),
      ...(userId && userId !== "all" && { donorId: userId }),
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    };
    if (categoryId && categoryId !== "all") {
      donationWhere.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }

    const donationFilters: Prisma.DonationWhereInput[] = [donationWhere];
    const providerWhere = donationProviderWhere(provider);
    if (providerWhere) donationFilters.push(providerWhere);
    if (["ACTIVE", "PAUSED", "CANCELLED", "PAYMENT_FAILED"].includes(subStatusRaw)) {
      donationFilters.push({ subscription: { is: { status: subStatusRaw as "ACTIVE" | "PAUSED" | "CANCELLED" | "PAYMENT_FAILED" } } });
    }
    // ناجح / قيد التأكيد / فاشل, as the tables show them.
    const statusWhere = donationStatusWhere(status);
    if (statusWhere) donationFilters.push(statusWhere);
    if (locale && locale !== "all") {
      donationFilters.push(
        locale === "__unset"
          ? { OR: [{ locale: null }, { locale: "" }] }
          : { locale }
      );
    }
    if (country && country !== "all") {
      donationFilters.push(
        country === "__unset"
          ? { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }] }
          : { donorCountryCode: country.toUpperCase() }
      );
    }
    const finalDonationWhere: Prisma.DonationWhereInput =
      donationFilters.length > 1 ? { AND: donationFilters } : donationWhere;

    const donationOrderBy: Prisma.DonationOrderByWithRelationInput =
      sortBy === "amount" ? { amountUSD: sortOrder } : { createdAt: sortOrder };

    // ── Subscription filter ───────────────────────────────────────────────────
    const subWhere: Prisma.SubscriptionWhereInput = {
      ...(userId && userId !== "all" && { donorId: userId }),
      ...(campaignId && campaignId !== "all" && { items: { some: { campaignId } } }),
    };
    if (
      subStatusRaw === "ACTIVE" ||
      subStatusRaw === "PAUSED" ||
      subStatusRaw === "CANCELLED" ||
      subStatusRaw === "PAYMENT_FAILED"
    ) {
      subWhere.status = subStatusRaw;
    }
    if (country && country !== "all") {
      subWhere.donor = country === "__unset" ? { OR: [{ countryCode: null }, { countryCode: "" }] } : { countryCode: country.toUpperCase() };
    }
    if (locale && locale !== "all") {
      subWhere.donations = { some: locale === "__unset" ? { OR: [{ locale: null }, { locale: "" }] } : { locale } };
    }
    if (provider && provider !== "all") {
      subWhere.AND = [...(Array.isArray(subWhere.AND) ? subWhere.AND : subWhere.AND ? [subWhere.AND] : []),
        provider === "__unset" ? { OR: [{ provider: null }, { provider: "" }, { provider: { isSet: false } }] } : { provider: provider.toUpperCase() }];
    }
    if (frequency) {
      // AND  the category branch below owns `subWhere.OR`.
      subWhere.AND = [...(Array.isArray(subWhere.AND) ? subWhere.AND : subWhere.AND ? [subWhere.AND] : []), subscriptionFrequencyWhere(frequency)];
    }
    if (categoryId && categoryId !== "all") {
      subWhere.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }

    const [donationRows, subRows] = await Promise.all([
      prisma.donation.findMany({
        where: finalDonationWhere,
        include: {
          donor: { select: { id: true, name: true, email: true, phone: true, countryCode: true } },
          items: { include: { campaign: { select: { id: true, title: true } } } },
          categoryItems: { include: { category: { select: { id: true, name: true } } } },
          referral: { select: { id: true, code: true, name: true } },
        },
        orderBy: donationOrderBy,
        take: limit,
      }),
      prisma.subscription.findMany({
        where: subWhere,
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: Math.min(limit, 20000),
      }),
    ]);

    const subIds = subRows.map(s => s.id);
    const frequencyOf = await loadSubscriptionFrequencies(prisma, [
      ...subIds,
      ...donationRows.map((d) => d.subscriptionId).filter((id): id is string => Boolean(id)),
    ]);

    const exportDonations: DonationExportRow[] = donationRows.map((d) => ({
      ...toDonationRow(d),
      frequency: d.subscriptionId ? frequencyOf(d.subscriptionId) : null,
    }));
    const exportSubscriptions = await loadReportSubscriptions(subIds);

    const filters: ExportFilterDescriptor[] = [];
    filters.push({
      label: dt("الفترة"),
      value: startParam || endParam ? `${startParam ?? "—"} → ${endParam ?? "—"}` : dt("كل الوقت"),
    });
    if (categoryId && categoryId !== "all") filters.push({ label: dt("القسم"), value: categoryId });
    if (campaignId && campaignId !== "all") filters.push({ label: dt("الحملة"), value: campaignId });
    if (userId && userId !== "all") filters.push({ label: dt("المتبرع"), value: userId });
    if (status) filters.push({ label: dt("حالة التبرع"), value: status });
    if (subStatusRaw && subStatusRaw !== "ALL") filters.push({ label: dt("حالة الاشتراك"), value: subStatusRaw });
    filters.push({ label: dt("الدورية"), value: frequency ? FREQUENCY_LABEL_AR[frequency] : dt("كل الدوريات") });
    if (locale && locale !== "all") filters.push({ label: dt("اللغة"), value: locale });
    if (country && country !== "all") filters.push({ label: dt("الدولة"), value: country });
    filters.push({ label: dt("عدد التبرعات"), value: String(donationRows.length) });
    filters.push({ label: dt("عدد الاشتراكات"), value: String(subRows.length) });

    if (provider && provider !== "all") filters.push({ label: dt("بوابة الدفع"), value: provider });
    filters.push({ label: dt("نطاق الاشتراكات"), value: dt("لقطة حالية للاشتراكات المطابقة؛ الفترة تخص التبرعات، وإجماليات الاشتراكات طوال المدة") });
    filters.push({ label: dt("أساس الفترة"), value: dt("تاريخ إنشاء التبرع؛ المبالغ المحصّلة تخص الدفعات المؤكدة ضمن النتائج المصدّرة") });
    filters.push({ label: dt("حد صفوف التبرعات"), value: String(limit) });
    const out = await buildDonationExport({
      format,
      period: { start: dateFilter.gte, end: dateFilter.lte },
      title: dt("تقرير التبرعات المتكررة"),
      subtitle: startParam || endParam
        ? dt("الفترة: {0} → {1}", [startParam ?? "—", endParam ?? "—"])
        : dt("الفترة: كل الوقت"),
      filters,
      donations: exportDonations,
      subscriptions: exportSubscriptions,
    });

    return new NextResponse(out.body as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": out.contentType,
        "Content-Disposition": buildContentDisposition(out),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("export recurring:", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

function toDonationRow(
  d: Prisma.DonationGetPayload<{
    include: {
      donor: { select: { id: true; name: true; email: true; phone: true; countryCode: true } };
      items: { include: { campaign: { select: { id: true; title: true } } } };
      categoryItems: { include: { category: { select: { id: true; name: true } } } };
      referral: { select: { id: true; code: true; name: true } };
    };
  }>
): DonationExportRow {
  const teamSupport = Number(d.teamSupport ?? 0);
  const fees = Number(d.coverFees ? d.fees ?? 0 : 0);
  const total = Number(d.totalAmount ?? 0);
  const baseAmount = Number(d.amount ?? Math.max(0, total - teamSupport - fees));
  return {
    id: d.id,
    status: d.status,
    type: d.subscriptionId ? "MONTHLY" : "ONE_TIME",
    createdAt: d.createdAt,
    paidAt: d.paidAt ?? null,
    donor: {
      id: d.donor?.id ?? null,
      name: d.donor?.name ?? null,
      email: d.donor?.email ?? null,
      phone: d.donor?.phone ?? null,
      countryCode: d.donor?.countryCode ?? null,
    },
    donorCountryCode: d.donorCountryCode ?? null,
    locale: d.locale ?? null,
    currency: d.currency,
    amount: baseAmount,
    amountUSD: d.amountUSD ?? null,
    teamSupport,
    fees,
    totalAmount: total,
    coverFees: !!d.coverFees,
    projectAllocations: [
      ...d.items.map(i => ({ id: `campaign:${i.campaign.id}`, title: i.campaign.title, amount: Number(i.amount) })),
      ...d.categoryItems.map(i => ({ id: `category:${i.category.id}`, title: i.category.name, amount: Number(i.amount) })),
    ],
    campaigns: d.items.map((i) => ({ id: i.campaign.id, title: i.campaign.title })),
    categories: d.categoryItems.map((c) => ({ id: c.category.id, name: c.category.name })),
    referral: d.referral ? { id: d.referral.id, code: d.referral.code, name: d.referral.name } : null,
    paymentMethod: d.paymentMethod ?? null,
    provider: d.provider ?? null,
    providerOrderId: d.providerOrderId ?? null,
    providerErrorMessage: d.providerErrorMessage ?? null,
    subscriptionId: d.subscriptionId ?? null,
    comment: d.comment ?? null,
    attribution: (d.attribution as Record<string, unknown> | null) ?? null,
  };
}


export async function GET(request: NextRequest) {
  const language = request.nextUrl.searchParams.get("reportLanguage") ?? parseDashLocale(request.cookies.get(DASH_LOCALE_COOKIE)?.value);
  return withReportLanguage(language, () => localizedGET(request));
}
