import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/** GET /api/admin/subscriptions — paginated list for dashboard (status, category, campaign, user) */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "monthly");
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const statusParam = (sp.get("status") || "ACTIVE").toUpperCase();
    const categoryId = sp.get("categoryId");
    const campaignId = sp.get("campaignId");
    const userId = sp.get("userId");
    const search = sp.get("search")?.trim();
    const referralIdParam = sp.get("referralId");
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(sp.get("limit") || "10", 10) || 10), 100);
    const sortBy = sp.get("sortBy") === "amount" ? "amount" : "date";
    const sortOrder = sp.get("sortOrder") === "asc" ? "asc" : "desc";

    if (referralIdParam) {
      const ref = await prisma.referral.findUnique({ where: { id: referralIdParam }, select: { id: true } });
      if (!ref) {
        return NextResponse.json({ error: "Referral not found" }, { status: 404 });
      }
    }

    const where: Prisma.SubscriptionWhereInput = {};

    if (referralIdParam) {
      where.referralId = referralIdParam;
    }

    if (statusParam !== "ALL") {
      if (statusParam === "ACTIVE" || statusParam === "PAUSED" || statusParam === "CANCELLED") {
        where.status = statusParam;
      }
    }

    if (userId && userId !== "all") {
      where.donorId = userId;
    }

    if (campaignId && campaignId !== "all") {
      where.items = { some: { campaignId } };
    } else if (categoryId && categoryId !== "all") {
      where.OR = [
        { items: { some: { campaign: { categoryIds: { has: categoryId } } } } },
        { categoryItems: { some: { categoryId } } },
      ];
    }

    // Free-text donor search (name OR email). Goes through AND rather than a second
    // top-level OR, because the category branch above may already own `where.OR` —
    // assigning it twice would silently drop the category filter.
    if (search) {
      const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [
        ...existingAnd,
        {
          donor: {
            is: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    const orderBy: Prisma.SubscriptionOrderByWithRelationInput =
      sortBy === "amount"
        ? { amountUSD: sortOrder }
        : { createdAt: sortOrder };

    const [total, rows] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          status: true,
          amount: true,
          amountUSD: true,
          currency: true,
          createdAt: true,
          nextBillingDate: true,
          lastBillingDate: true,
          donor: {
            select: {
              id: true,
              name: true,
              email: true,
              countryCode: true,
              countryName: true,
            },
          },
          referral: { select: { id: true, code: true } },
          items: { select: { campaign: { select: { id: true, title: true } } } },
          categoryItems: { select: { category: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    const subscriptions = rows.map((s) => ({
      id: s.id,
      status: s.status,
      amount: s.amount,
      amountUSD: s.amountUSD,
      currency: s.currency,
      createdAt: s.createdAt,
      nextBillingDate: s.nextBillingDate,
      lastBillingDate: s.lastBillingDate,
      donor: s.donor,
      referral: s.referral ? { id: s.referral.id, code: s.referral.code } : null,
      campaigns: s.items.map((i) => ({ id: i.campaign.id, title: i.campaign.title })),
      categories: s.categoryItems.map((c) => ({ id: c.category.id, name: c.category.name })),
    }));

    return NextResponse.json({
      subscriptions,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    console.error("Error listing subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to list subscriptions", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
