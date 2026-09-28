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
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  buildDonationExport,
  buildContentDisposition,
  type DonationExportRow,
  type SubscriptionExportRow,
  type ExportFilterDescriptor,
  type ExportFormat,
} from "@/lib/dashboard/donation-export";
import { istanbulDateKeysToUtcRange } from "@/lib/admin/istanbul-calendar";
import {
  donationFrequencyWhere,
  loadSubscriptionFrequencies,
  monthlyEquivalent,
  parseFrequencyParam,
  subscriptionFrequencyWhere,
} from "@/lib/dashboard/recurring-frequency-filter";

const FREQUENCY_LABEL_AR = { DAILY: "يومي", FRIDAY: "كل جمعة", MONTHLY: "شهري" } as const;

export async function GET(request: NextRequest) {
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
    const status = sp.get("status");                  // donation status
    const subStatusRaw = (sp.get("subStatus") || "all").toUpperCase();
    const locale = sp.get("locale")?.trim() ?? null;
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
      ...(status && ["PAID", "FAILED"].includes(status) && { status: status as "PAID" | "FAILED" }),
    };
    if (categoryId && categoryId !== "all") {
      donationWhere.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }

    const donationFilters: Prisma.DonationWhereInput[] = [donationWhere];
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
    if (frequency) {
      // AND  the category branch below owns `subWhere.OR`.
      subWhere.AND = [subscriptionFrequencyWhere(frequency)];
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
        include: {
          donor: { select: { id: true, name: true, email: true, phone: true, countryCode: true } },
          items: { select: { campaign: { select: { id: true, title: true } } } },
          categoryItems: { select: { category: { select: { id: true, name: true } } } },
          referral: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(limit, 20000),
      }),
    ]);

    // Charge totals per subscription (paid only)
    const subIds = subRows.map((s) => s.id);
    const chargeAggregates = subIds.length
      ? await prisma.donation.groupBy({
          by: ["subscriptionId"],
          where: { subscriptionId: { in: subIds }, status: "PAID" },
          _count: { _all: true },
          _sum: { amount: true, amountUSD: true },
        })
      : [];
    const chargesBySub = new Map<string, { count: number; amount: number; amountUSD: number }>();
    for (const c of chargeAggregates) {
      if (!c.subscriptionId) continue;
      chargesBySub.set(c.subscriptionId, {
        count: c._count._all,
        amount: Number(c._sum.amount ?? 0),
        amountUSD: Number(c._sum.amountUSD ?? 0),
      });
    }

    const frequencyOf = await loadSubscriptionFrequencies(prisma, [
      ...subIds,
      ...donationRows.map((d) => d.subscriptionId).filter((id): id is string => Boolean(id)),
    ]);

    const exportDonations: DonationExportRow[] = donationRows.map((d) => ({
      ...toDonationRow(d),
      frequency: d.subscriptionId ? frequencyOf(d.subscriptionId) : null,
    }));
    const exportSubscriptions: SubscriptionExportRow[] = subRows.map((s) => {
      const charges = chargesBySub.get(s.id);
      const planFrequency = frequencyOf(s.id);
      return {
        id: s.id,
        status: s.status,
        frequency: planFrequency,
        monthlyEquivalentUSD:
          s.amountUSD != null ? Number(monthlyEquivalent(s.amountUSD, planFrequency).toFixed(2)) : null,
        donor: {
          id: s.donor?.id ?? null,
          name: s.donor?.name ?? null,
          email: s.donor?.email ?? null,
          phone: null,
          countryCode: s.donor?.countryCode ?? null,
        },
        amount: Number(s.amount ?? 0),
        amountUSD: s.amountUSD ?? null,
        currency: s.currency,
        teamSupport: Number(s.teamSupport ?? 0),
        paymentMethod: s.paymentMethod ?? null,
        createdAt: s.createdAt,
        lastBillingDate: s.lastBillingDate ?? null,
        nextBillingDate: s.nextBillingDate ?? null,
        campaigns: s.items.map((i) => ({ id: i.campaign.id, title: i.campaign.title })),
        categories: s.categoryItems.map((c) => ({ id: c.category.id, name: c.category.name })),
        referral: s.referral ? { id: s.referral.id, code: s.referral.code, name: s.referral.name } : null,
        totalChargesCount: charges?.count ?? 0,
        totalChargesAmount: charges?.amount ?? 0,
        totalChargesAmountUSD: charges?.amountUSD ?? 0,
      };
    });

    const filters: ExportFilterDescriptor[] = [];
    filters.push({
      label: "الفترة",
      value: startParam || endParam ? `${startParam ?? "—"} → ${endParam ?? "—"}` : "كل الوقت",
    });
    if (categoryId && categoryId !== "all") filters.push({ label: "القسم", value: categoryId });
    if (campaignId && campaignId !== "all") filters.push({ label: "الحملة", value: campaignId });
    if (userId && userId !== "all") filters.push({ label: "المتبرع", value: userId });
    if (status && status !== "all") filters.push({ label: "حالة التبرع", value: status });
    if (subStatusRaw && subStatusRaw !== "ALL") filters.push({ label: "حالة الاشتراك", value: subStatusRaw });
    filters.push({ label: "الدورية", value: frequency ? FREQUENCY_LABEL_AR[frequency] : "كل الدوريات" });
    if (locale && locale !== "all") filters.push({ label: "اللغة", value: locale });
    if (country && country !== "all") filters.push({ label: "الدولة", value: country });
    filters.push({ label: "عدد التبرعات", value: String(donationRows.length) });
    filters.push({ label: "عدد الاشتراكات", value: String(subRows.length) });

    const out = await buildDonationExport({
      format,
      title: "تقرير التبرعات المتكررة",
      subtitle: startParam || endParam
        ? `الفترة: ${startParam ?? "—"} → ${endParam ?? "—"}`
        : "الفترة: كل الوقت",
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
