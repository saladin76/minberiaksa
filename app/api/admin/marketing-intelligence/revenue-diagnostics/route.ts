import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER, donationRowUsdApprox } from "@/lib/dashboard/donation-usd-revenue";

export const dynamic = "force-dynamic";

function numberParam(request: NextRequest, key: string, fallback: number, min: number, max: number) {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function displayAmount(row: { totalAmount?: number | null; amount: number }) {
  const total = Number(row.totalAmount);
  if (Number.isFinite(total) && total > 0) return total;
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const days = numberParam(request, "days", 1, 1, 90);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);

  const donations = await prisma.donation.findMany({
    where: { createdAt: { gte: from, lte: to }, ...PAID_DONATION_FILTER },
    select: {
      id: true,
      amount: true,
      amountUSD: true,
      totalAmount: true,
      currency: true,
      createdAt: true,
      paidAt: true,
      provider: true,
      donorCountryCode: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  let displayTotal = 0;
  let analyticalUsdTotal = 0;
  let rowsWithDifference = 0;
  let rowsMissingAmountUsd = 0;

  const samples = [];
  for (const donation of donations) {
    const display = displayAmount(donation);
    const usd = donationRowUsdApprox(donation);
    displayTotal += display;
    analyticalUsdTotal += usd;
    if (donation.amountUSD == null) rowsMissingAmountUsd += 1;
    if (Math.abs(display - usd) >= 0.01) {
      rowsWithDifference += 1;
      if (samples.length < 25) {
        samples.push({
          id: donation.id,
          currency: donation.currency,
          provider: donation.provider,
          createdAt: donation.createdAt.toISOString(),
          paidAt: donation.paidAt?.toISOString() ?? null,
          amount: donation.amount,
          totalAmount: donation.totalAmount,
          amountUSD: donation.amountUSD,
          displayAmount: round2(display),
          analyticalUsdAmount: round2(usd),
          difference: round2(display - usd),
          donorCountryCode: donation.donorCountryCode,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    range: { from: dateKey(from), to: dateKey(to), days, dateBasis: "createdAt" },
    filter: "createdAt range + status=PAID + paidAt set",
    totals: {
      donations: donations.length,
      displayTotal: round2(displayTotal),
      analyticalUsdTotal: round2(analyticalUsdTotal),
      difference: round2(displayTotal - analyticalUsdTotal),
      rowsWithDifference,
      rowsMissingAmountUsd,
    },
    explanation: {
      displayTotal: "Uses totalAmount when available, otherwise amount. This is closer to the dashboard chart display basis.",
      analyticalUsdTotal: "Uses amountUSD when available, with the official dashboard USD fallback helper. This is safer for ROAS against Meta spend.",
      difference: "displayTotal - analyticalUsdTotal. A difference usually means currency conversion, totalAmount/amountUSD mismatch, or missing amountUSD.",
    },
    samples,
  }, { headers: { "Cache-Control": "no-store" } });
}
