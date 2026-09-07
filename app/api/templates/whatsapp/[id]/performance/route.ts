import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import {
  computeTemplateRecommendations,
  type TemplatePerformance,
} from "@/lib/messaging/whatsapp-template-recommendations";
import type {
  NormalizedButton,
  NormalizedHeader,
  WhatsappTemplateKind,
} from "@/lib/messaging/twilio-templates";

/**
 * Return performance metrics + quality recommendations for one WhatsApp
 * template. Pulls per-recipient `SentMessage` rows by templateId, then joins
 * paid donations whose attribution carries the matching `twilio_template_id`
 * (set by the tracked-URL builder) to count donations + revenue.
 *
 * Clicks are not stored yet (no Twilio click-tracking webhook), so
 * `clicked = donations` as a conservative lower bound — replaced once the
 * webhook lands.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing template id" }, { status: 400 });

  const template = await prisma.whatsappTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      body: true,
      templateType: true,
      header: true,
      buttons: true,
      language: true,
      category: true,
      approvalStatus: true,
      externalTemplateId: true,
      provider: true,
    },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // SentMessage aggregates — per template (raw counts).
  const grouped = await prisma.sentMessage.groupBy({
    by: ["status"],
    where: { templateId: id, channel: "WHATSAPP" },
    _count: { _all: true },
  });
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const g of grouped) {
    if (g.status === "SENT") sent = g._count._all;
    else if (g.status === "FAILED") failed = g._count._all;
    else if (g.status === "SKIPPED") skipped = g._count._all;
  }

  // Best country / language — group SentMessage by recipient country (via
  // user join) if available. We do a lightweight lookup of recipientUserIds
  // and aggregate their donorCountryCode from the User table.
  const recentRecipients = await prisma.sentMessage.findMany({
    where: { templateId: id, channel: "WHATSAPP", recipientUserId: { not: null } },
    select: { recipientUserId: true, locale: true },
    take: 2000,
  });
  const userIds = Array.from(
    new Set(
      recentRecipients
        .map((r) => r.recipientUserId)
        .filter((v): v is string => !!v)
    )
  );
  const usersById = new Map<string, { countryCode: string | null }>();
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, countryCode: true },
    });
    for (const u of users) usersById.set(u.id, { countryCode: u.countryCode });
  }
  const byCountry = new Map<string, number>();
  const byLanguage = new Map<string, number>();
  for (const r of recentRecipients) {
    if (r.locale) byLanguage.set(r.locale, (byLanguage.get(r.locale) ?? 0) + 1);
    const cc = r.recipientUserId
      ? usersById.get(r.recipientUserId)?.countryCode
      : null;
    if (cc) byCountry.set(cc, (byCountry.get(cc) ?? 0) + 1);
  }
  const bestCountry = mapBest(byCountry);
  const bestLanguage = mapBest(byLanguage);

  // Donations attributed to this template via `twilio_template_id` UTM. We
  // match on either the internal template id OR the externalTemplateId — the
  // tracked-URL builder may use either depending on import state.
  const templateIdCandidates = [template.id, template.externalTemplateId].filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  const donationsRaw = await prisma.donation.findMany({
    where: {
      status: "PAID",
      paidAt: { not: null },
    },
    select: { id: true, attribution: true, amountUSD: true, totalAmount: true, amount: true },
    take: 5000,
  });
  let donations = 0;
  let revenueUSD = 0;
  for (const d of donationsRaw) {
    const attr = d.attribution as Record<string, unknown> | null;
    if (!attr) continue;
    const idInAttr =
      typeof attr["twilio_template_id"] === "string"
        ? (attr["twilio_template_id"] as string)
        : null;
    if (!idInAttr) continue;
    if (!templateIdCandidates.includes(idInAttr)) continue;
    donations += 1;
    revenueUSD += Number(d.amountUSD ?? d.totalAmount ?? d.amount ?? 0);
  }

  const performance: TemplatePerformance = {
    sent: sent + failed + skipped,
    delivered: sent,
    failed,
    clicked: donations, // lower bound — webhook would refine
    donations,
    revenueUSD: Math.round(revenueUSD * 100) / 100,
  };

  const clickToDonationRate =
    performance.clicked > 0 ? performance.donations / performance.clicked : 0;
  const failureRate =
    performance.sent > 0 ? performance.failed / performance.sent : 0;
  const revenuePerMessage =
    performance.sent > 0 ? performance.revenueUSD / performance.sent : 0;

  const recommendations = computeTemplateRecommendations({
    body: template.body,
    templateType: (template.templateType as WhatsappTemplateKind) ?? "text",
    header: (template.header as unknown as NormalizedHeader | null) ?? null,
    buttons: (template.buttons as unknown as NormalizedButton[] | null) ?? [],
    performance,
  });

  return NextResponse.json({
    template: {
      id: template.id,
      name: template.name,
      externalTemplateId: template.externalTemplateId,
      templateType: template.templateType,
      provider: template.provider,
      language: template.language,
      category: template.category,
      approvalStatus: template.approvalStatus,
    },
    performance: {
      ...performance,
      clickToDonationRate: Math.round(clickToDonationRate * 10000) / 10000,
      failureRate: Math.round(failureRate * 10000) / 10000,
      revenuePerMessage: Math.round(revenuePerMessage * 100) / 100,
    },
    bestCountry,
    bestLanguage,
    recommendations,
  });
}

function mapBest(m: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [k, v] of m.entries()) {
    if (!best || v > best.count) best = { key: k, count: v };
  }
  return best;
}
