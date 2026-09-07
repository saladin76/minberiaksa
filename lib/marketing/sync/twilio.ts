/**
 * Twilio sync — aggregates local `SentMessage` rows into per-day
 * `MarketingCampaignSnapshot` rows so the dashboard has rollups without
 * waiting on a real Twilio analytics endpoint.
 *
 * No real messages are sent. No Twilio API calls are made. We use the
 * site's own SentMessage table (already written by the existing send
 * pipeline) as the source of truth for sent/delivered/failed counts.
 * Donations + revenue are joined via `Donation.attribution.twilio_template_id`
 * which is set by the tracked-URL builder added in the earlier phase.
 */
import { prisma } from "@/lib/prisma";
import type { SyncClient, SyncMessagingSnapshot } from "./types";
import { missingConfigResult } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function classifyChannel(
  channel: string | null | undefined,
  locale: string | null | undefined
): SyncMessagingSnapshot["channel"] {
  if (channel === "EMAIL") return locale ? "TWILIO_EMAIL" : "EMAIL";
  // The existing Message model uses channel = EMAIL | WHATSAPP. Twilio
  // sender is the same provider — keep that mapping.
  return locale ? "TWILIO_WHATSAPP" : "WHATSAPP";
}

export const syncTwilio: SyncClient = async ({ connection, dateFrom, dateTo }) => {
  if (!connection.accountId || !connection.authToken) {
    return missingConfigResult(
      [!connection.accountId ? "accountId" : "", !connection.authToken ? "authToken" : ""].filter(
        (x) => x.length > 0
      ),
      "ناقص بيانات Twilio — Account SID و Auth Token مطلوبان قبل المزامنة."
    );
  }

  const from = startOfDay(dateFrom);
  const to = startOfDay(new Date(dateTo.getTime() + DAY_MS));

  // 1) Sent / delivered / failed counts per (templateId, channel, day)
  const sentRows = await prisma.sentMessage.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: {
      createdAt: true,
      status: true,
      templateId: true,
      templateName: true,
      channel: true,
      locale: true,
    },
  });

  interface Bucket {
    date: Date;
    channel: SyncMessagingSnapshot["channel"];
    campaignName: string | null;
    templateId: string | null;
    templateName: string | null;
    sent: number;
    delivered: number;
    failed: number;
  }
  const buckets = new Map<string, Bucket>();
  for (const r of sentRows) {
    const day = startOfDay(r.createdAt).toISOString();
    const channel = classifyChannel(r.channel, r.locale);
    const key = `${day}|${channel}|${r.templateId ?? "__none"}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        date: startOfDay(r.createdAt),
        channel,
        campaignName: r.templateName ?? null,
        templateId: r.templateId ?? null,
        templateName: r.templateName ?? null,
        sent: 0,
        delivered: 0,
        failed: 0,
      };
      buckets.set(key, b);
    }
    // Convention used by the existing send pipeline: SENT = accepted by provider.
    if (r.status === "SENT") {
      b.delivered += 1;
      b.sent += 1;
    } else if (r.status === "FAILED") {
      b.failed += 1;
      b.sent += 1;
    } else {
      b.sent += 1;
    }
  }

  // 2) Join paid donations whose attribution.twilio_template_id matches one
  // of our template ids — sum revenue + donation count per (templateId, day).
  const templateIds = Array.from(
    new Set(
      sentRows
        .map((r) => r.templateId)
        .filter((v): v is string => !!v)
    )
  );
  const donationsByTemplateDay = new Map<string, { donations: number; revenue: number }>();
  if (templateIds.length > 0) {
    const donations = await prisma.donation.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: from, lt: to },
      },
      select: {
        paidAt: true,
        attribution: true,
        amountUSD: true,
        totalAmount: true,
        amount: true,
      },
    });
    for (const d of donations) {
      if (!d.paidAt) continue;
      const attr = (d.attribution as Record<string, unknown> | null) ?? null;
      const tplId =
        attr && typeof attr["twilio_template_id"] === "string"
          ? (attr["twilio_template_id"] as string)
          : null;
      if (!tplId || !templateIds.includes(tplId)) continue;
      const day = startOfDay(d.paidAt).toISOString();
      const k = `${day}|${tplId}`;
      const prev = donationsByTemplateDay.get(k) ?? { donations: 0, revenue: 0 };
      prev.donations += 1;
      prev.revenue += Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0);
      donationsByTemplateDay.set(k, prev);
    }
  }

  const snapshots: SyncMessagingSnapshot[] = [];
  for (const b of buckets.values()) {
    const k = `${b.date.toISOString()}|${b.templateId ?? ""}`;
    const matched = donationsByTemplateDay.get(k);
    snapshots.push({
      provider: "TWILIO",
      channel: b.channel,
      date: b.date,
      campaignId: b.templateId, // we don't have a separate twilio_campaign_id table yet
      campaignName: b.campaignName,
      templateId: b.templateId,
      templateName: b.templateName,
      messageVariant: null,
      audienceSegment: null,
      sent: b.sent,
      delivered: b.delivered,
      failed: b.failed,
      opened: 0,
      clicked: matched?.donations ?? 0, // lower bound until click webhook lands
      replied: 0,
      donations: matched?.donations ?? 0,
      revenue: matched ? Math.round(matched.revenue * 100) / 100 : 0,
      cost: 0,
      currency: "USD",
    });
  }

  return {
    status: "SUCCESS",
    rowsFetched: snapshots.length,
    message:
      snapshots.length === 0
        ? "لا توجد رسائل في هذه الفترة — لا توجد بيانات للمزامنة."
        : `تم تجميع ${snapshots.length} لقطة رسائل من قاعدة البيانات المحلية.`,
    snapshots: { messaging: snapshots },
  };
};
