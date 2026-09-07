import { prisma } from "@/lib/prisma";
import { tgSendMessage } from "./client";
import { getTelegramConfig } from "./config";
import {
  formatDonationDetails,
  formatDonorSummary,
  formatHelp,
  formatStatsSnapshot,
  formatIstanbulDateTime,
  formatMoneyUSD,
  type FormattableDonation,
  type StatsSnapshot,
} from "./format";
import { DONATION_NOTIFY_SELECT } from "./notify";

// ─────────────────────────────────────────────────────────────────── helpers ──

/** Returns midnight-UTC start of (today - N days) and midnight-UTC tomorrow.
 *  Stats endpoints use UTC day boundaries so we stay consistent with them. */
function daysAgoRange(days: number): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days - 1);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

async function loadStatsSnapshot(periodLabel: string, range: { start: Date | null; end: Date | null }): Promise<StatsSnapshot> {
  const dateFilter =
    range.start && range.end ? { createdAt: { gte: range.start, lt: range.end } } : {};

  const PAID = { status: "PAID", paidAt: { not: null } } as const;
  const FAILED = { status: "FAILED" } as const;
  // status=PAID + paidAt null = checkout started but gateway never confirmed (abandoned/in-flight).
  const PENDING_PAID = { status: "PAID", paidAt: null } as const;

  // One-time donations are stored with subscriptionId completely absent (Prisma's
  // MongoDB connector doesn't always match {subscriptionId: null} against rows
  // where the field was never written). To avoid that footgun, only filter the
  // side that definitely matches — `subscriptionId: { not: null }` for monthly —
  // and derive one-time by subtraction.
  const [paidCount, paidSum, failedCount, pendingCount, monthlyCount, topItems] =
    await Promise.all([
      prisma.donation.count({ where: { ...dateFilter, ...PAID } }),
      prisma.donation.aggregate({
        _sum: { amountUSD: true },
        where: { ...dateFilter, ...PAID },
      }),
      prisma.donation.count({ where: { ...dateFilter, ...FAILED } }),
      prisma.donation.count({ where: { ...dateFilter, ...PENDING_PAID } }),
      prisma.donation.count({ where: { ...dateFilter, ...PAID, subscriptionId: { not: null } } }),
      prisma.donationItem.groupBy({
        by: ["campaignId"],
        where: { donation: { ...dateFilter, ...PAID } },
        _sum: { amountUSD: true },
        _count: { id: true },
        orderBy: { _sum: { amountUSD: "desc" } },
        take: 5,
      }),
    ]);

  const oneTimeCount = Math.max(0, paidCount - monthlyCount);

  let topCampaigns: StatsSnapshot["topCampaigns"] = [];
  if (topItems.length > 0) {
    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: topItems.map((t) => t.campaignId) } },
      select: { id: true, title: true },
    });
    const titleById = new Map(campaigns.map((c) => [c.id, c.title]));
    topCampaigns = topItems.map((t) => ({
      title: titleById.get(t.campaignId) ?? "—",
      total: t._sum.amountUSD ?? 0,
      count: t._count.id,
    }));
  }

  return {
    periodLabel,
    paidCount,
    paidTotalUSD: paidSum._sum.amountUSD ?? 0,
    failedCount,
    pendingCount,
    oneTimeCount,
    monthlyCount,
    topCampaigns,
  };
}

async function recentDonationsList(
  where: Record<string, unknown>,
  title: string,
  limit = 8
): Promise<string> {
  const rows = await prisma.donation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      amountUSD: true,
      currency: true,
      totalAmount: true,
      status: true,
      paidAt: true,
      createdAt: true,
      providerErrorMessage: true,
      donor: { select: { name: true, email: true } },
      items: { select: { campaign: { select: { title: true } } } },
      categoryItems: { select: { category: { select: { name: true } } } },
    },
  });
  if (rows.length === 0) return `<b>${title}</b>\n\nلا توجد نتائج.`;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = [`<b>${title}</b>`, ""];
  for (const r of rows) {
    const usd = formatMoneyUSD(r.amountUSD ?? 0) || `${r.totalAmount} ${r.currency}`;
    const target =
      r.items[0]?.campaign?.title ||
      (r.categoryItems[0]?.category?.name ? `فئة: ${r.categoryItems[0].category.name}` : "—");
    const who = r.donor?.name?.trim() || r.donor?.email || "Guest";
    const when = formatIstanbulDateTime(r.createdAt);
    const lead =
      r.status === "FAILED" ? "❌" : r.status === "PAID" && r.paidAt ? "✅" : "⏳";
    lines.push(`${lead} <b>${escape(usd)}</b> · ${escape(who)} → ${escape(target)}`);
    lines.push(`   <i>${escape(when)}</i> · <code>${escape(r.id)}</code>`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────── dispatcher ──

interface CommandContext {
  chatId: string | number;
  replyToMessageId?: number;
}

async function reply(ctx: CommandContext, text: string): Promise<void> {
  await tgSendMessage(ctx.chatId, text, {
    html: true,
    disablePreview: true,
    replyToMessageId: ctx.replyToMessageId,
  });
}

async function handleStats(ctx: CommandContext, period: "day" | "week" | "month" | "all") {
  const labels: Record<typeof period, string> = {
    day: "اليوم",
    week: "آخر ٧ أيام",
    month: "آخر ٣٠ يوم",
    all: "كل الوقت",
  };
  const range =
    period === "all"
      ? { start: null, end: null }
      : (() => {
          const days = period === "day" ? 0 : period === "week" ? 6 : 29;
          const r = daysAgoRange(days);
          return { start: r.start, end: r.end };
        })();
  const snap = await loadStatsSnapshot(labels[period], range);
  await reply(ctx, formatStatsSnapshot(snap));
}

async function handleDonation(ctx: CommandContext, id: string) {
  const row = await prisma.donation.findUnique({
    where: { id },
    select: DONATION_NOTIFY_SELECT,
  });
  if (!row) {
    await reply(ctx, `❓ لم أجد تبرعاً بالمعرّف <code>${id}</code>`);
    return;
  }
  await reply(ctx, formatDonationDetails(row as unknown as FormattableDonation));
}

async function handleDonor(ctx: CommandContext, query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    await reply(ctx, "استخدم: <code>/donor &lt;email أو الاسم&gt;</code>");
    return;
  }
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: trimmed, mode: "insensitive" } },
        { name: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    take: 5,
    select: { id: true, name: true, email: true, countryCode: true },
  });
  if (users.length === 0) {
    await reply(ctx, `❓ لم أجد متبرعاً مطابقاً لـ <code>${trimmed}</code>`);
    return;
  }

  const blocks: string[] = [];
  for (const u of users) {
    const agg = await prisma.donation.aggregate({
      where: { donorId: u.id, status: "PAID", paidAt: { not: null } },
      _count: { id: true },
      _sum: { amountUSD: true },
      _max: { createdAt: true },
    });
    blocks.push(
      formatDonorSummary({
        name: u.name,
        email: u.email ?? "",
        countryCode: u.countryCode ?? null,
        donationsCount: agg._count.id ?? 0,
        totalUSD: agg._sum.amountUSD ?? 0,
        lastDonationAt: agg._max.createdAt ?? null,
      })
    );
  }
  await reply(ctx, blocks.join("\n\n──────────\n\n"));
}

async function handleCampaign(ctx: CommandContext, query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    await reply(ctx, "استخدم: <code>/campaign &lt;اسم أو معرف&gt;</code>");
    return;
  }
  const isLikelyId = /^[a-f0-9]{20,}$/i.test(trimmed);
  const campaign = isLikelyId
    ? await prisma.campaign.findUnique({ where: { id: trimmed }, select: { id: true, title: true } })
    : await prisma.campaign.findFirst({
        where: {
          OR: [
            { title: { contains: trimmed, mode: "insensitive" } },
            { slug: { contains: trimmed, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true },
      });
  if (!campaign) {
    await reply(ctx, `❓ لم أجد مشروعاً مطابقاً لـ <code>${trimmed}</code>`);
    return;
  }
  const sum = await prisma.donationItem.aggregate({
    where: { campaignId: campaign.id, donation: { status: "PAID", paidAt: { not: null } } },
    _sum: { amountUSD: true },
    _count: { id: true },
  });
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  await reply(
    ctx,
    [
      `🎯 <b>${escape(campaign.title)}</b>`,
      `<code>${campaign.id}</code>`,
      "",
      `✅ ${sum._count.id ?? 0} تبرع ناجح — ${formatMoneyUSD(sum._sum.amountUSD ?? 0) || "$0"}`,
    ].join("\n")
  );
}

interface ParsedCommand {
  cmd: string;
  arg: string;
}

/** BOM, zero-width, directional and isolate marks. Arabic/Persian mobile
 *  keyboards inject these before Latin chars so a naive `text.startsWith("/")`
 *  fails on visually-correct input. */
const INVISIBLE_CHARS_RE = /[​-‏‪-‮⁦-⁩﻿]/g;

function parseCommand(
  text: string,
  entities?: Array<{ type?: string; offset?: number; length?: number }> | null
): ParsedCommand | null {
  // 1) Trust Telegram. When the client recognises a `/foo` it tags it as a
  //    bot_command entity, with offset/length pointing at the slash + name in
  //    the raw text. Use that first — it's authoritative and immune to weird
  //    invisible characters the user's keyboard might have injected.
  if (entities && entities.length > 0) {
    const cmdEntity = entities.find((e) => e.type === "bot_command");
    if (cmdEntity && typeof cmdEntity.offset === "number" && typeof cmdEntity.length === "number") {
      const raw = text.slice(cmdEntity.offset, cmdEntity.offset + cmdEntity.length);
      // raw is e.g. "/help" or "/help@botname"
      const m = raw.match(/^\/(\w+)(?:@\w+)?$/);
      if (m) {
        const arg = text
          .slice(cmdEntity.offset + cmdEntity.length)
          .replace(INVISIBLE_CHARS_RE, "")
          .trim();
        return { cmd: m[1].toLowerCase(), arg };
      }
    }
  }

  // 2) Fallback to text parsing — strip invisible chars before checking.
  const cleaned = text.replace(INVISIBLE_CHARS_RE, "").trim();
  if (!cleaned.startsWith("/")) return null;
  const m = cleaned.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]+))?$/);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), arg: (m[2] ?? "").trim() };
}

/**
 * Top-level dispatch. Returns true if the message was handled (so the webhook
 * can reply with 200 quickly). Never throws.
 */
export async function dispatchTelegramCommand(input: {
  chatId: string | number;
  fromChatId: string | number;
  text: string;
  entities?: Array<{ type?: string; offset?: number; length?: number }> | null;
  messageId?: number;
}): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg) return;

  // Allowlist: only respond in approved chats. Otherwise stay silent.
  if (!cfg.allowedChatIds.has(String(input.fromChatId))) {
    console.warn(`[telegram] command from un-allowlisted chat ${input.fromChatId} ignored`);
    return;
  }

  const ctx: CommandContext = { chatId: input.chatId, replyToMessageId: input.messageId };

  const parsed = parseCommand(input.text, input.entities);
  if (!parsed) {
    await reply(ctx, "🤖 لم أفهم. أرسل <code>/help</code> لعرض الأوامر المتاحة.");
    return;
  }

  try {
    switch (parsed.cmd) {
      case "start":
      case "help":
        await reply(ctx, formatHelp());
        return;

      case "today":
        await handleStats(ctx, "day");
        return;
      case "week":
        await handleStats(ctx, "week");
        return;
      case "month":
        await handleStats(ctx, "month");
        return;
      case "total":
      case "all":
        await handleStats(ctx, "all");
        return;

      case "failed":
        await reply(ctx, await recentDonationsList({ status: "FAILED" }, "❌ آخر التبرعات الفاشلة"));
        return;
      case "pending":
        await reply(
          ctx,
          await recentDonationsList(
            { status: "PAID", paidAt: null },
            "⏳ تبرعات قيد التأكيد"
          )
        );
        return;
      case "recent":
        await reply(
          ctx,
          await recentDonationsList(
            { status: "PAID", paidAt: { not: null } },
            "✅ آخر التبرعات الناجحة"
          )
        );
        return;

      case "donation":
        await handleDonation(ctx, parsed.arg);
        return;
      case "donor":
        await handleDonor(ctx, parsed.arg);
        return;
      case "campaign":
        await handleCampaign(ctx, parsed.arg);
        return;

      default:
        await reply(ctx, `❓ أمر غير معروف: <code>/${parsed.cmd}</code>\nأرسل <code>/help</code>.`);
    }
  } catch (err) {
    console.error(`[telegram] command /${parsed.cmd} failed:`, err);
    await reply(ctx, "⚠️ تعذّر تنفيذ الأمر. حاول لاحقاً.");
  }
}
