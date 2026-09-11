import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/bank-accounts/admin — the dashboard listing.
 *
 * Returns inactive rows and ignores the locale allow-list, so it sits behind
 * the dashboard permission. Currency codes come back for the list to show at a
 * glance; the identifiers themselves load on the edit page only.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const rows = await prisma.bankAccount.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        branch: true,
        holder: true,
        logo: true,
        locales: true,
        order: true,
        isActive: true,
        currencies: { select: { code: true } },
        _count: { select: { translations: true } },
      },
    });

    const items = rows.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      branch: b.branch ?? "",
      holder: b.holder,
      logo: b.logo ?? "",
      locales: b.locales,
      order: b.order,
      isActive: b.isActive,
      currencyCodes: b.currencies.map((c) => c.code),
      translationCount: b._count.translations,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    return NextResponse.json({ error: "Failed to fetch bank accounts" }, { status: 500 });
  }
}
