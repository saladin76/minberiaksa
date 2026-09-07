/**
 * GET /api/admin/monthly/export
 *
 * XLSX (default) or CSV export covering monthly subscriptions AND the recurring
 * donations they have generated. Two sheets + the standard cover summary:
 *   • التبرعات — every charge against a monthly subscription (filtered)
 *   • الاشتراكات — subscription roster (active/paused/cancelled) with charge totals
 *
 * Filters mirror the monthly dashboard:
 *   format, start, end, categoryId, campaignId, userId, status (donation),
 *   subStatus (subscription: ACTIVE|PAUSED|CANCELLED|all), locale, country,
 *   sortBy, sortOrder.
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

    // ── Donation filter (monthly only) ────────────────────────────────────────
    const donationWhere: Prisma.DonationWhereInput = {
      subscriptionId: { not: null },
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
      subStatusRaw === "CANCELLED"
    ) {
      subWhere.status = subStatusRaw;
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

    const exportDonations: DonationExportRow[] = donationRows.map(toDonationRow);
    const exportSubscriptions: SubscriptionExportRow[] = subRows.map((s) => {
      const charges = chargesBySub.get(s.id);
      return {
        id: s.id,
        status: s.status,
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
    if (locale && locale !== "all") filters.push({ label: "اللغة", value: locale });
    if (country && country !== "all") filters.push({ label: "الدولة", value: country });
    filters.push({ label: "عدد التبرعات", value: String(donationRows.length) });
    filters.push({ label: "عدد الاشتراكات", value: String(subRows.length) });

    const out = await buildDonationExport({
      format,
      title: "تقرير الاشتراكات الشهرية",
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
    console.error("export monthly:", e);
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
