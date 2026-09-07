import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { metaDonationEventId } from "@/lib/tracking/canonical";
import { buildMetaUserData } from "@/lib/tracking/meta-capi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Single source of truth for what this route loads. The helpers below are typed from THIS
 * object, so if a field is ever dropped from the query the helper that reads it stops
 * compiling — previously they were typed as a bare `findUnique` payload (no relations), which
 * made `row.donor` a type error and, more importantly, meant the types could not have caught
 * an actually-missing include.
 */
const donationTrackingInclude = {
  donor: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      countryCode: true,
      city: true,
      region: true,
      gender: true,
      birthdate: true,
    },
  },
  items: { include: { campaign: { select: { id: true, title: true } } } },
  categoryItems: { include: { category: { select: { id: true, name: true } } } },
} satisfies Prisma.DonationInclude;

type DonationTrackingRow = Prisma.DonationGetPayload<{
  include: typeof donationTrackingInclude;
}>;

interface TrackingContent {
  id: string;
  quantity: number;
  item_price: number;
}

interface TrackingResponseOk {
  ok: true;
  eventName: "Donate";
  eventId: string;
  transactionId: string;
  orderId: string;
  value: number;
  currency: string;
  contentType: "donation";
  contentIds: string[];
  contentName: string;
  contentCategory: string;
  contents: TrackingContent[];
  numItems: number;
  status: "paid";
  success: true;
  paymentInfoAvailable: true;
  donationType: "ONE_TIME" | "MONTHLY";
  paymentMethod: string;
  browserAdvancedMatching?: Record<string, string>;
}

interface TrackingResponseFail {
  ok: false;
  reason: string;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) return value[0];
  return undefined;
}

function paidDonationValue(row: DonationTrackingRow) {
  const total = Number(row.totalAmount ?? 0);
  if (Number.isFinite(total) && total > 0) return total;
  const amount = Number(row.amount ?? 0);
  const teamSupport = Number(row.teamSupport ?? 0);
  const fees = Number(row.fees ?? 0);
  const fallback = amount + teamSupport + fees;
  return Number.isFinite(fallback) ? fallback : 0;
}

function buildBrowserAdvancedMatching(row: DonationTrackingRow) {
  const donor = row.donor;
  const [firstName, ...rest] = (donor?.name ?? "").trim().split(/\s+/);
  const metaUserData = buildMetaUserData({
    external_id: donor?.id ?? null,
    email: donor?.email ?? null,
    phone: donor?.phone ?? null,
    first_name: firstName || null,
    last_name: rest.join(" ") || null,
    city: donor?.city ?? null,
    state: donor?.region ?? null,
    country_code: donor?.countryCode ?? row.donorCountryCode ?? null,
    gender: donor?.gender ?? null,
    date_of_birth: donor?.birthdate ?? null,
  });

  const out: Record<string, string> = {};
  for (const key of ["em", "ph", "fn", "ln", "ct", "st", "country", "ge", "db", "external_id"] as const) {
    const value = firstString(metaUserData[key]);
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json<TrackingResponseFail>({ ok: false, reason: "missing donation id" }, { status: 400 });
  }

  const row = await prisma.donation.findUnique({
    where: { id },
    include: donationTrackingInclude,
  });

  if (!row) {
    return NextResponse.json<TrackingResponseFail>({ ok: false, reason: "not found" }, { status: 404 });
  }

  if (row.status !== "PAID") {
    return NextResponse.json<TrackingResponseFail>({ ok: false, reason: `not paid (status=${row.status})` }, { status: 200 });
  }
  if (row.paidAt == null) {
    return NextResponse.json<TrackingResponseFail>({ ok: false, reason: "paidAt unset" }, { status: 200 });
  }

  const value = paidDonationValue(row);
  if (!(value > 0)) {
    return NextResponse.json<TrackingResponseFail>({ ok: false, reason: "amount <= 0" }, { status: 200 });
  }

  const contents: TrackingContent[] = [];
  const contentIds: string[] = [];
  let primaryName: string | undefined;

  for (const it of row.items) {
    contents.push({ id: it.campaignId, quantity: 1, item_price: it.amount });
    contentIds.push(it.campaignId);
    if (!primaryName && it.campaign?.title) primaryName = it.campaign.title;
  }
  for (const ci of row.categoryItems) {
    contents.push({ id: ci.categoryId, quantity: 1, item_price: ci.amount });
    contentIds.push(ci.categoryId);
    if (!primaryName && ci.category?.name) primaryName = ci.category.name;
  }
  if (row.teamSupport > 0) {
    contents.push({ id: "team_support", quantity: 1, item_price: row.teamSupport });
    contentIds.push("team_support");
  }
  if (row.fees > 0) {
    contents.push({ id: "covered_fees", quantity: 1, item_price: row.fees });
    contentIds.push("covered_fees");
  }
  if (contents.length === 0) {
    contents.push({ id: "donation", quantity: 1, item_price: value });
    contentIds.push("donation");
  }

  const isMonthly = !!row.subscriptionId;

  const payload: TrackingResponseOk = {
    ok: true,
    eventName: "Donate",
    eventId: metaDonationEventId(row.id, "success"),
    transactionId: row.id,
    orderId: row.id,
    value,
    currency: row.currency || "USD",
    contentType: "donation",
    contentIds,
    contentName: primaryName ?? "Donation",
    contentCategory: isMonthly ? "monthly" : "donation",
    contents,
    numItems: contents.reduce((s, c) => s + c.quantity, 0),
    status: "paid",
    success: true,
    paymentInfoAvailable: true,
    donationType: isMonthly ? "MONTHLY" : "ONE_TIME",
    paymentMethod: (row.paymentMethod ?? "CARD").toLowerCase(),
    browserAdvancedMatching: buildBrowserAdvancedMatching(row),
  };

  return NextResponse.json<TrackingResponseOk>(payload, {
    status: 200,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
