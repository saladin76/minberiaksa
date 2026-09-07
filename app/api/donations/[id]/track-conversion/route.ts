import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDonationServerConversions } from "@/lib/tracking/donation-conversion-server";
import { metaDonationEventId } from "@/lib/tracking/canonical";
import {
  pickAttributionForAudit,
  toTurkeyIso,
  writeConversionAudit,
} from "@/lib/tracking/conversion-audit";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ allowed: false, reason: "missing donation id" }, { status: 400 });
  }

  const row = await prisma.donation.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      paidAt: true,
      createdAt: true,
      conversionEventsSentAt: true,
      amount: true,
      totalAmount: true,
      amountUSD: true,
      currency: true,
      provider: true,
      attribution: true,
    },
  });

  if (!row) {
    await writeConversionAudit({
      donationId: id,
      stage: "track_conversion_rejected",
      message: "Donate browser permission rejected: donation not found",
      metadata: { reason: "not_found" },
    });
    return NextResponse.json({ allowed: false, reason: "not found" }, { status: 404 });
  }

  const eventId = metaDonationEventId(row.id, "success");
  const auditBase = {
    status: row.status,
    amount: row.amount,
    amount_usd: row.amountUSD,
    total_amount: row.totalAmount,
    currency: row.currency,
    provider: row.provider,
    created_at_utc: row.createdAt.toISOString(),
    created_at_turkey: toTurkeyIso(row.createdAt),
    paid_at_utc: row.paidAt?.toISOString() ?? null,
    paid_at_turkey: toTurkeyIso(row.paidAt),
    conversion_events_sent_at_utc: row.conversionEventsSentAt?.toISOString() ?? null,
    conversion_events_sent_at_turkey: toTurkeyIso(row.conversionEventsSentAt),
    reporting_timezone: "Europe/Istanbul",
    payment_provider_timezone: "America/Toronto",
    attribution: pickAttributionForAudit(row.attribution),
  };

  await writeConversionAudit({
    donationId: row.id,
    eventId,
    stage: "track_conversion_request",
    message: "Donate browser permission requested",
    metadata: auditBase,
  });

  if (row.status !== "PAID" || row.paidAt == null) {
    await writeConversionAudit({
      donationId: row.id,
      eventId,
      stage: "track_conversion_rejected",
      message: "Donate browser permission rejected: donation is not paid",
      metadata: { ...auditBase, reason: `not paid (status=${row.status})` },
    });
    return NextResponse.json(
      { allowed: false, reason: `not paid (status=${row.status})` },
      { status: 200 }
    );
  }

  if (row.conversionEventsSentAt != null) {
    await writeConversionAudit({
      donationId: row.id,
      eventId,
      stage: "track_conversion_rejected",
      message: "Donate browser permission rejected: conversion already recorded",
      metadata: { ...auditBase, reason: "conversion_already_recorded", already_fired: true },
    });
    return NextResponse.json(
      { allowed: false, alreadyFired: true, eventId, reason: "conversion already recorded" },
      { status: 200 }
    );
  }

  const result = await sendDonationServerConversions(row.id);

  if (result.skipped) {
    await writeConversionAudit({
      donationId: row.id,
      eventId,
      stage: "track_conversion_rejected",
      message: "Donate browser permission rejected: server conversion skipped",
      metadata: { ...auditBase, reason: result.reason ?? "conversion_skipped", meta_result: result },
    });
    return NextResponse.json(
      { allowed: false, alreadyFired: true, eventId, reason: result.reason ?? "conversion skipped" },
      { status: 200 }
    );
  }

  if (!result.ok) {
    await writeConversionAudit({
      donationId: row.id,
      eventId,
      stage: "track_conversion_rejected",
      message: "Donate browser permission rejected: server conversion failed",
      metadata: { ...auditBase, reason: result.error ?? "server_conversion_failed", meta_result: result },
    });
    return NextResponse.json(
      { allowed: false, alreadyFired: false, eventId, reason: result.error ?? "server conversion failed" },
      { status: 200 }
    );
  }

  await writeConversionAudit({
    donationId: row.id,
    eventId,
    stage: "track_conversion_allowed",
    message: "Donate browser permission allowed",
    metadata: { ...auditBase, meta_result: result },
  });

  return NextResponse.json({ allowed: true, alreadyFired: false, eventId }, { status: 200 });
}
