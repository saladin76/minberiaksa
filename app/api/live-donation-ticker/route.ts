import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { normalizeTickerDisplayNames } from "@/lib/donations/public-ticker-display";

/**
 * GET: Fetch live donation ticker configuration
 * Returns the active ticker config with all settings
 */
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("view") === "admin") {
      const session = await getServerSession(authOptions);
      const denied = requireAdminOrDashboardPermission(session, "ticker");
      if (denied) return denied;

      const config = await prisma.liveDonationTicker.findFirst({ orderBy: { updatedAt: "desc" } });
      return config ? NextResponse.json(config) : NextResponse.json({ error: "No ticker configuration found" }, { status: 404 });
    }

    // The public ticker uses only operator-entered display names and amount
    // ranges. It never queries Donation or User records.
    const ticker = await prisma.liveDonationTicker.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' }
    });
    if (!ticker) return NextResponse.json({ enabled: false });

    return NextResponse.json({
      enabled: ticker.donorNames.length > 0 && ticker.amountRanges.length > 0,
      donorNames: ticker.donorNames,
      amountRanges: ticker.amountRanges,
      minIntervalSeconds: ticker.minIntervalSeconds,
      maxIntervalSeconds: ticker.maxIntervalSeconds,
    });
  } catch (error) {
    console.error('Error fetching ticker config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ticker configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST: Create or update ticker configuration (admin-only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'ticker');
    if (denied) return denied;

    const data = await request.json();
    const { minIntervalSeconds, maxIntervalSeconds, donorNames, amountRanges, isActive = true } = data;
    const timingError = validateTiming(minIntervalSeconds ?? 3, maxIntervalSeconds ?? 8);
    if (timingError) return NextResponse.json({ error: timingError }, { status: 400 });
    if (typeof isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    }
    const normalizedNames = normalizeTickerDisplayNames(donorNames);
    const normalizedRanges = normalizeAmountRanges(amountRanges);
    if (!normalizedNames?.length) return NextResponse.json({ error: "Display names must be non-empty strings, at most 80 characters each, with no more than 100 entries" }, { status: 400 });
    if (!normalizedRanges?.length) return NextResponse.json({ error: "Add amount ranges whose probabilities total 100" }, { status: 400 });

    // Keep the active configuration intact if creating its replacement fails.
    const ticker = await prisma.$transaction(async (tx) => {
      await tx.liveDonationTicker.updateMany({ where: {}, data: { isActive: false } });
      return tx.liveDonationTicker.create({
        data: {
          isActive,
          donorNames: normalizedNames,
          amountRanges: normalizedRanges,
          minIntervalSeconds: minIntervalSeconds ?? 3,
          maxIntervalSeconds: maxIntervalSeconds ?? 8,
        },
      });
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "TICKER_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ إعدادًا جديدًا لتيكر التبرعات المباشر`,
      entityType: "LiveDonationTicker",
      entityId: ticker.id,
    });

    return NextResponse.json(ticker, { status: 201 });
  } catch (error) {
    console.error('Error creating ticker config:', error);
    return NextResponse.json(
      { error: 'Failed to create ticker configuration' },
      { status: 500 }
    );
  }
}

/**
 * PATCH: Update existing ticker configuration (admin-only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'ticker');
    if (denied) return denied;

    const data = await request.json();
    const { id, ...updates } = data;

    if (!id) {
      return NextResponse.json(
        { error: 'Ticker ID is required' },
        { status: 400 }
      );
    }

    const current = await prisma.liveDonationTicker.findUnique({
      where: { id },
      select: { donorNames: true, amountRanges: true, minIntervalSeconds: true, maxIntervalSeconds: true },
    });
    if (!current) return NextResponse.json({ error: "Ticker configuration not found" }, { status: 404 });

    const allowedUpdates: Record<string, unknown> = {};
    if (typeof updates.isActive === "boolean") allowedUpdates.isActive = updates.isActive;
    else if (updates.isActive !== undefined) return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    if (updates.donorNames !== undefined) {
      const names = normalizeTickerDisplayNames(updates.donorNames);
      if (!names?.length) return NextResponse.json({ error: "Display names must be non-empty strings, at most 80 characters each, with no more than 100 entries" }, { status: 400 });
      allowedUpdates.donorNames = names;
    }
    if (updates.amountRanges !== undefined) {
      const ranges = normalizeAmountRanges(updates.amountRanges);
      if (!ranges?.length) return NextResponse.json({ error: "Add amount ranges whose probabilities total 100" }, { status: 400 });
      allowedUpdates.amountRanges = ranges;
    }
    if (updates.minIntervalSeconds !== undefined) allowedUpdates.minIntervalSeconds = updates.minIntervalSeconds;
    if (updates.maxIntervalSeconds !== undefined) allowedUpdates.maxIntervalSeconds = updates.maxIntervalSeconds;
    const nextMin = Number.isInteger(allowedUpdates.minIntervalSeconds) ? Number(allowedUpdates.minIntervalSeconds) : undefined;
    const nextMax = Number.isInteger(allowedUpdates.maxIntervalSeconds) ? Number(allowedUpdates.maxIntervalSeconds) : undefined;
    if ((updates.minIntervalSeconds !== undefined && nextMin === undefined) || (updates.maxIntervalSeconds !== undefined && nextMax === undefined)) {
      return NextResponse.json({ error: "Interval values must be whole numbers" }, { status: 400 });
    }
    const timingError = validateTiming(nextMin ?? current.minIntervalSeconds, nextMax ?? current.maxIntervalSeconds);
    if (timingError) return NextResponse.json({ error: timingError }, { status: 400 });
    const mergedRanges = (allowedUpdates.amountRanges as { probability: number }[] | undefined) ?? current.amountRanges;
    if (Math.abs(mergedRanges.reduce((sum, range) => sum + range.probability, 0) - 100) > 0.01) {
      return NextResponse.json({ error: "Amount range probabilities must total 100" }, { status: 400 });
    }
    if (!Object.keys(allowedUpdates).length) {
      return NextResponse.json({ error: "No supported settings were provided" }, { status: 400 });
    }

    const ticker = await prisma.$transaction(async (tx) => {
      // There must be one active configuration at most. POST already enforces
      // this; reactivating an older row through PATCH must preserve the same
      // invariant so the public endpoint cannot switch between stale configs.
      if (allowedUpdates.isActive === true) {
        await tx.liveDonationTicker.updateMany({
          where: { id: { not: id } },
          data: { isActive: false },
        });
      }
      return tx.liveDonationTicker.update({
        where: { id },
        data: allowedUpdates,
      });
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "TICKER_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل إعداد تيكر التبرعات المباشر`,
      entityType: "LiveDonationTicker",
      entityId: id,
    });

    return NextResponse.json(ticker);
  } catch (error) {
    console.error('Error updating ticker config:', error);
    return NextResponse.json(
      { error: 'Failed to update ticker configuration' },
      { status: 500 }
    );
  }
}

function validateTiming(minIntervalSeconds: unknown, maxIntervalSeconds: unknown): string | null {
  if (!Number.isInteger(minIntervalSeconds) || !Number.isInteger(maxIntervalSeconds)) {
    return "Interval values must be whole numbers";
  }
  const min = Number(minIntervalSeconds);
  const max = Number(maxIntervalSeconds);
  if (min < 3 || max < min || max > 3600) {
    return "Intervals must be between 3 and 3600 seconds, with the minimum no greater than the maximum";
  }
  return null;
}

function normalizeAmountRanges(rawRanges: unknown): { minAmount: number; maxAmount: number; probability: number; label: string }[] | null {
  if (!Array.isArray(rawRanges) || rawRanges.length === 0 || rawRanges.length > 20) return null;
  const ranges: { minAmount: number; maxAmount: number; probability: number; label: string }[] = [];
  for (const rangeValue of rawRanges) {
    if (!rangeValue || typeof rangeValue !== "object") return null;
    const range = rangeValue as Record<string, unknown>;
    if (
      typeof range.minAmount !== "number" || !Number.isFinite(range.minAmount) || range.minAmount < 0 ||
      typeof range.maxAmount !== "number" || !Number.isFinite(range.maxAmount) || range.maxAmount < range.minAmount ||
      typeof range.probability !== "number" || !Number.isFinite(range.probability) || range.probability < 0 || range.probability > 100 ||
      typeof range.label !== "string"
    ) return null;
    ranges.push({
      minAmount: range.minAmount,
      maxAmount: range.maxAmount,
      probability: range.probability,
      label: range.label.trim().slice(0, 60),
    });
  }
  return Math.abs(ranges.reduce((sum, range) => sum + range.probability, 0) - 100) <= 0.01 ? ranges : null;
}

/**
 * DELETE: Delete ticker configuration (admin-only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'ticker');
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Ticker ID is required' },
        { status: 400 }
      );
    }

    await prisma.liveDonationTicker.delete({
      where: { id }
    });

    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "TICKER_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف إعداد تيكر التبرعات المباشر`,
      entityType: "LiveDonationTicker",
      entityId: id,
    });

    return NextResponse.json({ message: 'Ticker configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticker config:', error);
    return NextResponse.json(
      { error: 'Failed to delete ticker configuration' },
      { status: 500 }
    );
  }
}
