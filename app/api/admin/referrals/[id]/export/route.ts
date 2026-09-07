/**
 * GET /api/admin/referrals/[id]/export
 *
 * XLSX or CSV export of every donation attributed to a single referral code,
 * plus the cover summary (per-campaign / per-category / per-currency / etc.).
 *
 * Filters mirror the referral analytics page:
 *   format, start, end, categoryId, campaignId, status, locale, country,
 *   subscriptionOnly, sortBy, sortOrder.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "referrals");
    if (denied) return denied;
    const exportDenied = requireAdminOrDashboardPermission(session, "reportsExport");
    if (exportDenied) return exportDenied;

    const { id: referralId } = await params;
    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      select: { id: true, code: true, name: true },
    });
    if (!referral) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }

    const sp = request.nextUrl.searchParams;
    const format: ExportFormat = sp.get("format") === "csv" ? "csv" : "xlsx";
    const campaignId = sp.get("campaignId");
    const categoryId = sp.get("categoryId");
    const startParam = sp.get("start");
    const endParam = sp.get("end");
    const sortBy = (sp.get("sortBy") || "date") as "date" | "amount";
    const sortOrder = (sp.get("sortOrder") || "desc") as "asc" | "desc";
    const status = sp.get("status");
    const locale = sp.get("locale")?.trim() ?? null;
    const country = sp.get("country")?.trim() ?? null;
    const subscriptionOnly = sp.get("subscriptionOnly") === "true" || sp.get("subscriptionOnly") === "1";
    const donationType = sp.get("donationType");
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

    const baseWhere: Prisma.DonationWhereInput = {
      referralId,
      ...(campaignId && campaignId !== "all" && { items: { some: { campaignId } } }),
      ...(subscriptionOnly && { subscriptionId: { not: null } }),
      ...(donationType === "MONTHLY" && { subscriptionId: { not: null } }),
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      ...(status && ["PAID", "FAILED"].includes(status) && { status: status as "PAID" | "FAILED" }),
    };
    if (categoryId && categoryId !== "all") {
      baseWhere.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }

    const donationFilters: Prisma.DonationWhereInput[] = [baseWhere];
    if (locale && locale !== "all") {
      donationFilters.push(
        locale === "__unset" ? { OR: [{ locale: null }, { locale: "" }] } : { locale }
      );
    }
    if (country && country !== "all") {
      donationFilters.push(
        country === "__unset"
          ? { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }] }
          : { donorCountryCode: country.toUpperCase() }
      );
    }
    if (donationType === "ONE_TIME") {
      donationFilters.push({ OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }] });
    }
    const where: Prisma.DonationWhereInput = donationFilters.length > 1 ? { AND: donationFilters } : baseWhere;
    const orderBy: Prisma.DonationOrderByWithRelationInput =
      sortBy === "amount" ? { amountUSD: sortOrder } : { createdAt: sortOrder };

    const rows = await prisma.donation.findMany({
      where,
      include: {
        donor: { select: { id: true, name: true, email: true, phone: true, countryCode: true } },
        items: { include: { campaign: { select: { id: true, title: true } } } },
        categoryItems: { include: { category: { select: { id: true, name: true } } } },
        referral: { select: { id: true, code: true, name: true } },
      },
      orderBy,
      take: limit,
    });

    // Pull subscriptions attributed to this referral for the secondary sheet
    const subRows = await prisma.subscription.findMany({
      where: { referralId },
      include: {
        donor: { select: { id: true, name: true, email: true, countryCode: true } },
        items: { select: { campaign: { select: { id: true, title: true } } } },
        categoryItems: { select: { category: { select: { id: true, name: true } } } },
        referral: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });
    const subIds = subRows.map((s) => s.id);
    const charges = subIds.length
      ? await prisma.donation.groupBy({
          by: ["subscriptionId"],
          where: { subscriptionId: { in: subIds }, status: "PAID" },
          _count: { _all: true },
          _sum: { amount: true, amountUSD: true },
        })
      : [];
    const chargeMap = new Map<string, { count: number; amount: number; amountUSD: number }>();
    for (const c of charges) {
      if (!c.subscriptionId) continue;
      chargeMap.set(c.subscriptionId, {
        count: c._count._all,
        amount: Number(c._sum.amount ?? 0),
        amountUSD: Number(c._sum.amountUSD ?? 0),
      });
    }

    const exportDonations: DonationExportRow[] = rows.map((d) => {
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
    });

    const exportSubscriptions: SubscriptionExportRow[] = subRows.map((s) => {
      const c = chargeMap.get(s.id);
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
        categories: s.categoryItems.map((cat) => ({ id: cat.category.id, name: cat.category.name })),
        referral: s.referral ? { id: s.referral.id, code: s.referral.code, name: s.referral.name } : null,
        totalChargesCount: c?.count ?? 0,
        totalChargesAmount: c?.amount ?? 0,
        totalChargesAmountUSD: c?.amountUSD ?? 0,
      };
    });

    const filters: ExportFilterDescriptor[] = [];
    filters.push({ label: "رمز الإحالة", value: referral.code });
    if (referral.name) filters.push({ label: "اسم الإحالة", value: referral.name });
    filters.push({
      label: "الفترة",
      value: startParam || endParam ? `${startParam ?? "—"} → ${endParam ?? "—"}` : "كل الوقت",
    });
    if (categoryId && categoryId !== "all") filters.push({ label: "القسم", value: categoryId });
    if (campaignId && campaignId !== "all") filters.push({ label: "الحملة", value: campaignId });
    if (status && status !== "all") filters.push({ label: "الحالة", value: status });
    if (locale && locale !== "all") filters.push({ label: "اللغة", value: locale });
    if (country && country !== "all") filters.push({ label: "الدولة", value: country });
    if (subscriptionOnly) filters.push({ label: "الاشتراكات فقط", value: "نعم" });
    filters.push({ label: "عدد التبرعات", value: String(rows.length) });
    filters.push({ label: "عدد الاشتراكات", value: String(subRows.length) });

    const subtitle = referral.name
      ? `الإحالة: ${referral.code} — ${referral.name}`
      : `الإحالة: ${referral.code}`;

    const out = await buildDonationExport({
      format,
      title: "تقرير الإحالة",
      subtitle,
      filters,
      donations: exportDonations,
      subscriptions: exportSubscriptions.length > 0 ? exportSubscriptions : undefined,
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
    console.error("export referral:", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
