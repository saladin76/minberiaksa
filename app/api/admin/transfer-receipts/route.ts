import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { BankTransferClaimStatus, Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { DONATION_INCLUDE } from "@/lib/donations/bank-transfer-claims";
import { serializeClaimForAdmin } from "@/lib/donations/bank-transfer-serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: readonly BankTransferClaimStatus[] = ["UNDER_REVIEW", "AWAITING_RECEIPT", "REJECTED", "CONFIRMED"];
const PAGE_SIZE_MAX = 100;

type SortKey = "priority" | "newest" | "oldest" | "amountDesc" | "amountAsc";

/**
 * The finance queue: donor-submitted bank transfer receipts.
 *
 * `counts` come back with every page so the tabs read correctly regardless
 * of which one is open. "priority" is the working order — receipts waiting
 * on a decision first, longest-waiting at the top — and is the default.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(sp.get("limit")) || 24));
  const statusIn = sp.get("status");
  const status = STATUSES.includes(statusIn as BankTransferClaimStatus) ? (statusIn as BankTransferClaimStatus) : null;
  const q = (sp.get("q") ?? "").trim();
  const currency = (sp.get("currency") ?? "").trim().toUpperCase();
  const bank = (sp.get("bank") ?? "").trim();
  const from = sp.get("from");
  const to = sp.get("to");
  const sort = (sp.get("sort") as SortKey) || "priority";

  const where: Prisma.BankTransferClaimWhereInput = {};
  if (status) where.status = status;
  if (bank) where.bankSlug = bank;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }
  const donationWhere: Prisma.DonationWhereInput = {};
  if (currency) donationWhere.currency = currency;
  if (q) {
    /* A 24-hex query is an id — the donation's or the claim's — which is what
       a Telegram card or a support thread hands over. */
    const isId = /^[0-9a-f]{24}$/i.test(q);
    where.OR = [
      ...(isId ? [{ id: q }, { donationId: q }] : []),
      { senderName: { contains: q, mode: "insensitive" as const } },
      { transferReference: { contains: q, mode: "insensitive" as const } },
      {
        donation: {
          donor: {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
            ],
          },
        },
      },
    ];
  }
  if (Object.keys(donationWhere).length) where.donation = donationWhere;

  const orderBy: Prisma.BankTransferClaimOrderByWithRelationInput[] =
    sort === "newest"
      ? [{ createdAt: "desc" }]
      : sort === "oldest"
        ? [{ createdAt: "asc" }]
        : sort === "amountDesc"
          ? [{ donation: { amountUSD: "desc" } }, { createdAt: "desc" }]
          : sort === "amountAsc"
            ? [{ donation: { amountUSD: "asc" } }, { createdAt: "desc" }]
            : /* priority: ordered in memory below; oldest first so the
                 longest-waiting lead within each status. */
              [{ createdAt: "asc" }];

  const [rows, total, grouped, banks, usdRows] = await Promise.all([
    prisma.bankTransferClaim.findMany({
      where,
      orderBy,
      skip: sort === "priority" ? 0 : (page - 1) * limit,
      take: sort === "priority" ? PAGE_SIZE_MAX * 5 : limit,
      include: { donation: { include: DONATION_INCLUDE } },
    }),
    prisma.bankTransferClaim.count({ where }),
    prisma.bankTransferClaim.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.bankTransferClaim.findMany({
      where: { bankSlug: { not: null } },
      distinct: ["bankSlug"],
      select: { bankSlug: true, bankName: true },
    }),
    /* USD value per status for the summary band. Prisma cannot sum across a
       relation in one groupBy; the population is small (transfers are a
       fraction of donations) so the scalar pairs are read and added here. */
    prisma.bankTransferClaim.findMany({
      select: { status: true, donation: { select: { amountUSD: true } } },
    }),
  ]);

  const usdByStatus: Record<string, number> = {};
  for (const s of STATUSES) usdByStatus[s] = 0;
  for (const r of usdRows) usdByStatus[r.status] += r.donation.amountUSD ?? 0;

  const counts: Record<string, number> = { all: 0 };
  for (const s of STATUSES) counts[s] = 0;
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    counts.all += g._count._all;
  }

  let list = rows;
  if (sort === "priority") {
    const rank = (s: BankTransferClaimStatus) => STATUSES.indexOf(s);
    list = [...rows]
      .sort((a, b) => rank(a.status) - rank(b.status) || a.createdAt.getTime() - b.createdAt.getTime())
      .slice((page - 1) * limit, page * limit);
  }

  return NextResponse.json({
    claims: list.map(serializeClaimForAdmin),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    counts,
    usdByStatus,
    banks: banks.filter((b) => b.bankSlug).map((b) => ({ slug: b.bankSlug!, name: b.bankName ?? b.bankSlug! })),
  });
}
