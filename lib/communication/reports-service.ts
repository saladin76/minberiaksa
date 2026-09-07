import { prisma } from "@/lib/prisma";
import { SUPPORTED_LOCALES, LOCALES, type SupportedLocale } from "@/lib/locales";
import { listSenders } from "./sender-service";
import { listChannelTemplates } from "./template-compat";
import { getRecipientBreakdown } from "./campaign-recipient-service";
import { listConversations } from "./conversation-service";

/**
 * Read-only Communication Center reports for management: delivery performance by channel and
 * language, top failure/skip reasons, conversations awaiting a reply, and campaigns awaiting review.
 * Everything is derived from real archive data — no fake attribution. When there is no data a section
 * is simply empty. Internal status/reason codes are humanized before they leave this module.
 */

export type ReportRange = "today" | "7d" | "30d" | "all";

export type StatusCounts = {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  opened: number;
  clicked: number;
  replied: number;
  failed: number;
  skipped: number;
};

function emptyCounts(): StatusCounts {
  return { total: 0, sent: 0, delivered: 0, read: 0, opened: 0, clicked: 0, replied: 0, failed: 0, skipped: 0 };
}

function tally(c: StatusCounts, status: string) {
  c.total += 1;
  switch (status) {
    case "SENT":
    case "SENT_TO_PROVIDER":
      c.sent += 1;
      break;
    case "DELIVERED":
      c.delivered += 1;
      break;
    case "READ":
      c.read += 1;
      break;
    case "OPENED":
      c.opened += 1;
      break;
    case "CLICKED":
      c.clicked += 1;
      break;
    case "REPLIED":
      c.replied += 1;
      break;
    case "FAILED":
    case "BOUNCED":
      c.failed += 1;
      break;
    case "SKIPPED":
      c.skipped += 1;
      break;
  }
}

/** Messages that actually reached the recipient (delivered or any later confirmed stage). */
export function reachedCount(c: StatusCounts): number {
  return c.delivered + c.read + c.opened + c.clicked + c.replied;
}
/** Messages the recipient read / opened / clicked / replied to. */
export function engagedCount(c: StatusCounts): number {
  return c.read + c.opened + c.clicked + c.replied;
}
/** Messages that left toward the provider (sent or any later stage). */
export function sentOutCount(c: StatusCounts): number {
  return c.sent + reachedCount(c);
}

/** Turn internal status/reason codes into plain Arabic — never leak raw provider/internal terms. */
export function humanizeReason(raw: string | null | undefined): string {
  const r = (raw ?? "").trim();
  if (!r) return "بدون سبب مُسجّل";
  const up = r.toUpperCase();
  if (up.includes("SMS") && (up.includes("NOT_IMPLEMENTED") || up.includes("NOT_CONFIGURED"))) return "الرسائل القصيرة غير مفعّلة";
  if (up.includes("META_WHATSAPP") && up.includes("NOT_CONFIGURED")) return "إعداد واتساب غير مكتمل";
  if (up.includes("EMAIL") && up.includes("NOT_CONFIGURED")) return "إعداد الإيميل غير مكتمل";
  if (up.includes("SENDER") && (up.includes("MISSING") || up.includes("PHONE_NUMBER_ID"))) return "المُرسِل بلا رقم مُعرّف";
  if (up.includes("DO_NOT_CONTACT") || up.includes("DONOTCONTACT")) return "مُدرَج ضمن عدم الإزعاج";
  if (up.includes("CONSENT") || up.includes("OPT_IN") || up.includes("OPTIN")) return "بلا موافقة على التواصل";
  if (up.includes("NO_TEMPLATE") || up.includes("TEMPLATE_MISSING") || up.includes("NO_VARIANT")) return "لا يوجد قالب مناسب للّغة";
  if (up.includes("NO_PHONE") || up.includes("MISSING_PHONE")) return "المستلم بلا رقم واتساب";
  if (up.includes("NO_EMAIL") || up.includes("MISSING_EMAIL")) return "المستلم بلا بريد إلكتروني";
  if (up.includes("UNAUTHORIZED") || up.includes("TOKEN")) return "رمز الوصول غير صالح";
  if (up.includes("RATE") && up.includes("LIMIT")) return "تجاوز حد الإرسال لدى المزود";
  if (up.endsWith("_NOT_CONFIGURED")) return "إعداد المزوّد غير مكتمل";
  if (up.includes("REQUEST_FAILED") || up.includes("INVALID_RESPONSE")) return "تعذّر الوصول إلى المزوّد";
  // Unknown provider text — surface it but trimmed, so management still sees something actionable.
  return r.length > 80 ? `${r.slice(0, 77)}…` : r;
}

export type CommunicationReport = {
  generatedAt: string;
  range: ReportRange;
  totalDeliveries: number;
  totals: StatusCounts;
  headline: { prepared: number; reached: number; engaged: number; failed: number; repliesNeedingAction: number };
  byChannel: { channel: string; counts: StatusCounts }[];
  byLanguage: { locale: string; label: string; counts: StatusCounts }[];
  failureReasons: { reason: string; count: number }[];
  skippedReasons: { reason: string; count: number }[];
  repliesNeedingAction: number;
  conversationsNeedingReply: { phone: string; name: string | null; lastInboundText: string | null; lastMessageAt: string | null }[];
  campaignsNeedingReview: { id: string; name: string; channel: string; status: string; reason: string }[];
  missingConsentWhatsApp: number;
  missingTemplateLanguages: { channel: string; locales: string[] }[];
};

const CHANNEL_ORDER = ["WHATSAPP", "EMAIL", "SMS"];

function rangeStart(range: ReportRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function emptyReport(range: ReportRange): CommunicationReport {
  return {
    generatedAt: new Date().toISOString(),
    range,
    totalDeliveries: 0,
    totals: emptyCounts(),
    headline: { prepared: 0, reached: 0, engaged: 0, failed: 0, repliesNeedingAction: 0 },
    byChannel: [],
    byLanguage: [],
    failureReasons: [],
    skippedReasons: [],
    repliesNeedingAction: 0,
    conversationsNeedingReply: [],
    campaignsNeedingReview: [],
    missingConsentWhatsApp: 0,
    missingTemplateLanguages: [],
  };
}

export async function getCommunicationReport(range: ReportRange = "30d"): Promise<CommunicationReport> {
  if (!process.env.DATABASE_URL) return emptyReport(range);

  const from = rangeStart(range);
  const createdAt = from ? { gte: from } : undefined;

  const deliveries = await prisma.communicationDelivery
    .findMany({
      where: { createdAt },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { id: true, channel: true, status: true, locale: true, senderId: true, errorMessage: true, createdAt: true },
    })
    .catch(() => []);

  const totals = emptyCounts();
  const channelMap = new Map<string, StatusCounts>();
  const langMap = new Map<string, StatusCounts>();
  const failureReasonMap = new Map<string, number>();
  const skippedReasonMap = new Map<string, number>();

  for (const d of deliveries) {
    tally(totals, d.status);
    const ch = channelMap.get(d.channel) ?? emptyCounts();
    tally(ch, d.status);
    channelMap.set(d.channel, ch);
    if (d.locale) {
      const lg = langMap.get(d.locale) ?? emptyCounts();
      tally(lg, d.status);
      langMap.set(d.locale, lg);
    }
    if (d.status === "FAILED" || d.status === "BOUNCED") {
      const key = humanizeReason(d.errorMessage);
      failureReasonMap.set(key, (failureReasonMap.get(key) ?? 0) + 1);
    } else if (d.status === "SKIPPED") {
      const key = humanizeReason(d.errorMessage);
      skippedReasonMap.set(key, (skippedReasonMap.get(key) ?? 0) + 1);
    }
  }

  const [conversations, waTemplates, emailTemplates, waAudience, campaigns] = await Promise.all([
    listConversations().catch(() => []),
    listChannelTemplates("WHATSAPP"),
    listChannelTemplates("EMAIL"),
    getRecipientBreakdown("WHATSAPP").catch(() => null),
    loadCampaignsNeedingReview(),
  ]);

  // Languages that have eligible recipients but no template variant covers them.
  const templateLocales = (list: { availableLocales: string[] }[]) => new Set(list.flatMap((t) => t.availableLocales));
  const waCovered = templateLocales(waTemplates);
  const emailCovered = templateLocales(emailTemplates);
  const audienceLangs: SupportedLocale[] = waAudience ? waAudience.locales.filter((l) => l.eligible > 0 || l.needsReview > 0).map((l) => l.locale) : [];
  const missingTemplateLanguages: { channel: string; locales: string[] }[] = [];
  const waMissing = audienceLangs.filter((l) => !waCovered.has(l));
  if (waMissing.length) missingTemplateLanguages.push({ channel: "WHATSAPP", locales: waMissing });
  const emailMissing = audienceLangs.filter((l) => !emailCovered.has(l));
  if (emailMissing.length) missingTemplateLanguages.push({ channel: "EMAIL", locales: emailMissing });

  const needingReply = conversations.filter((c) => c.needsReply);
  const topReasons = (m: Map<string, number>) => [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    range,
    totalDeliveries: deliveries.length,
    totals,
    headline: {
      prepared: totals.total,
      reached: reachedCount(totals),
      engaged: engagedCount(totals),
      failed: totals.failed,
      repliesNeedingAction: needingReply.length,
    },
    byChannel: CHANNEL_ORDER.map((channel) => ({ channel, counts: channelMap.get(channel) ?? emptyCounts() })),
    byLanguage: SUPPORTED_LOCALES.filter((l) => langMap.has(l)).map((l) => ({ locale: l, label: LOCALES[l].label, counts: langMap.get(l)! })),
    failureReasons: topReasons(failureReasonMap),
    skippedReasons: topReasons(skippedReasonMap),
    repliesNeedingAction: needingReply.length,
    conversationsNeedingReply: needingReply.slice(0, 8).map((c) => ({ phone: c.phone, name: c.donor?.name ?? null, lastInboundText: c.lastInboundText, lastMessageAt: c.lastMessageAt })),
    campaignsNeedingReview: campaigns,
    missingConsentWhatsApp: waAudience?.totals.needsReview ?? 0,
    missingTemplateLanguages,
  };
}

/** Campaigns that a manager should act on: awaiting review, failed, or scheduled past their time. */
async function loadCampaignsNeedingReview(): Promise<CommunicationReport["campaignsNeedingReview"]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const now = new Date();
    const rows = await prisma.communicationCampaign.findMany({
      where: { OR: [{ status: "REVIEW" }, { status: "FAILED" }, { status: "SCHEDULED", scheduledAt: { lt: now } }] },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { id: true, name: true, channel: true, status: true, scheduledAt: true },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      status: c.status,
      reason: c.status === "REVIEW" ? "بانتظار الموافقة" : c.status === "FAILED" ? "فشل الإرسال" : "فات موعد الجدولة ولم تُرسل",
    }));
  } catch (error) {
    console.error("loadCampaignsNeedingReview failed", error);
    return [];
  }
}
