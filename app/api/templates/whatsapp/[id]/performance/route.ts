import { getTemplateDonationOutcome } from "@/lib/communication/campaign-attribution-service";
import { tallyDeliveryRows } from "@/lib/communication/campaign-counter-service";
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
 * template. Meta metrics use the active CommunicationDelivery archive, while
 * legacy templates retain their original SentMessage archive. Revenue requires
 * a confirmed payment and campaign/template attribution; replies and donations
 * are never manufactured into click events.
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

  const isMeta = template.provider === "META_WHATSAPP";
  const [deliveryRows, legacyGrouped, recentRecipients, outcome] = await Promise.all([
    isMeta ? prisma.communicationDelivery.findMany({
      where: { templateId: id, channel: "WHATSAPP" },
      select: { status: true, sentAt: true, providerMessageId: true, deliveredAt: true, readAt: true, openedAt: true, clickedAt: true, repliedAt: true },
    }) : Promise.resolve([]),
    isMeta ? Promise.resolve([]) : prisma.sentMessage.groupBy({ by: ["status"], where: { templateId: id, channel: "WHATSAPP" }, _count: { _all: true } }),
    isMeta ? prisma.communicationDelivery.findMany({ where: { templateId: id, channel: "WHATSAPP", recipientUserId: { not: null } }, select: { recipientUserId: true, locale: true }, take: 2000 })
      : prisma.sentMessage.findMany({ where: { templateId: id, channel: "WHATSAPP", recipientUserId: { not: null } }, select: { recipientUserId: true, locale: true }, take: 2000 }),
    getTemplateDonationOutcome(template),
  ]);
  const counters = tallyDeliveryRows(deliveryRows);
  const legacySent = legacyGrouped.filter(row => row.status === "SENT").reduce((sum, row) => sum + row._count._all, 0);
  const legacyFailed = legacyGrouped.filter(row => row.status === "FAILED").reduce((sum, row) => sum + row._count._all, 0);
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

  const performance: TemplatePerformance = {
    sent: isMeta ? counters.sent : legacySent,
    delivered: isMeta ? counters.delivered : 0,
    failed: isMeta ? counters.failed : legacyFailed,
    clicked: isMeta ? counters.clicked : 0,
    donations: outcome.donationCount,
    revenueUSD: outcome.revenue,
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
      unpricedPaidCount: outcome.unpricedPaidCount,
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
