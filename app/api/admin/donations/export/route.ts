/**
 * GET /api/admin/donations/export
 *
 * Returns an XLSX (default) or CSV file containing every donation matching the
 * dashboard filter selection, plus a cover sheet with KPIs, per-campaign,
 * per-category, per-currency, per-country, per-referral, per-locale,
 * per-provider and per-status breakdowns sorted highest to lowest.
 *
 * Query params mirror the dashboard donation list:
 *   format=xlsx|csv (default xlsx)
 *   start, end       YYYY-MM-DD
 *   categoryId, campaignId, userId, referralId
 *   status           PAID | FAILED | all
 *   locale, country
 *   subscriptionOnly true|false
 *   sortBy           date | amount
 *   sortOrder        asc | desc
 *   limit            max rows (default 20000, cap 50000)
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
  type ExportFilterDescriptor,
  type ExportFormat,
} from "@/lib/dashboard/donation-export";
import { istanbulDateKeysToUtcRange } from "@/lib/admin/istanbul-calendar";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "revenue");
    if (denied) return denied;
    const exportDenied = requireAdminOrDashboardPermission(session, "reportsExport");
    if (exportDenied) return exportDenied;

    const sp = request.nextUrl.searchParams;
    const format: ExportFormat = sp.get("format") === "csv" ? "csv" : "xlsx";
    const campaignId = sp.get("campaignId");
    const userId = sp.get("userId");
    const categoryId = sp.get("categoryId");
    const referralId = sp.get("referralId");
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
      ...(campaignId && campaignId !== "all" && { items: { some: { campaignId } } }),
      ...(userId && userId !== "all" && { donorId: userId }),
      ...(referralId && referralId !== "all" && { referralId }),
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

    const filters: Prisma.DonationWhereInput[] = [baseWhere];
    if (locale && locale !== "all") {
      filters.push(
        locale === "__unset"
          ? { OR: [{ locale: null }, { locale: "" }] }
          : { locale }
      );
    }
    if (country && country !== "all") {
      filters.push(
        country === "__unset"
          ? { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }] }
          : { donorCountryCode: country.toUpperCase() }
      );
    }
    if (donationType === "ONE_TIME") {
      filters.push({ OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }] });
    }
    const where: Prisma.DonationWhereInput = filters.length > 1 ? { AND: filters } : baseWhere;

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

    const exportRows: DonationExportRow[] = rows.map((d) => {
      const teamSupport = Number(d.teamSupport ?? 0);
      const fees = Number(d.coverFees ? d.fees ?? 0 : 0);
      const total = Number(d.totalAmount ?? 0);
      // "amount" should be the donation portion only — split team support
      // and fees out so finance can run operating costs separately.
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

    const exportFilters: ExportFilterDescriptor[] = collectFilterDescriptors({
      startParam,
      endParam,
      categoryId,
      campaignId,
      userId,
      referralId,
      status,
      locale,
      country,
      subscriptionOnly,
      sortBy,
      sortOrder,
      total: rows.length,
    });

    let titleSubtitle = "";
    if (startParam || endParam) {
      titleSubtitle = `الفترة: ${startParam ?? "—"} → ${endParam ?? "—"}`;
    } else {
      titleSubtitle = "الفترة: كل الوقت";
    }

    const out = await buildDonationExport({
      format,
      title: "تقرير التبرعات",
      subtitle: titleSubtitle,
      filters: exportFilters,
      donations: exportRows,
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
    console.error("export donations:", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

function collectFilterDescriptors(args: {
  startParam: string | null;
  endParam: string | null;
  categoryId: string | null;
  campaignId: string | null;
  userId: string | null;
  referralId: string | null;
  status: string | null;
  locale: string | null;
  country: string | null;
  subscriptionOnly: boolean;
  sortBy: string;
  sortOrder: string;
  total: number;
}): ExportFilterDescriptor[] {
  const out: ExportFilterDescriptor[] = [];
  if (args.startParam || args.endParam) {
    out.push({ label: "الفترة", value: `${args.startParam ?? "—"} → ${args.endParam ?? "—"}` });
  } else {
    out.push({ label: "الفترة", value: "كل الوقت" });
  }
  if (args.categoryId && args.categoryId !== "all") out.push({ label: "القسم", value: args.categoryId });
  if (args.campaignId && args.campaignId !== "all") out.push({ label: "الحملة", value: args.campaignId });
  if (args.userId && args.userId !== "all") out.push({ label: "المتبرع", value: args.userId });
  if (args.referralId && args.referralId !== "all") out.push({ label: "الإحالة", value: args.referralId });
  if (args.status && args.status !== "all") out.push({ label: "الحالة", value: args.status });
  if (args.locale && args.locale !== "all") out.push({ label: "اللغة", value: args.locale });
  if (args.country && args.country !== "all") out.push({ label: "الدولة", value: args.country });
  if (args.subscriptionOnly) out.push({ label: "الاشتراكات فقط", value: "نعم" });
  out.push({ label: "الفرز", value: `${args.sortBy === "amount" ? "بالقيمة" : "بالتاريخ"} • ${args.sortOrder === "asc" ? "تصاعدي" : "تنازلي"}` });
  out.push({ label: "عدد العمليات", value: String(args.total) });
  return out;
}
