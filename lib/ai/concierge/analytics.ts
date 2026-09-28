import "server-only";

import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER, donationRowUsdApprox } from "@/lib/dashboard/donation-usd-revenue";
import {
  addIstanbulCalendarDays,
  eachIstanbulDateKey,
  formatIstanbulDateKey,
  istanbulDateKeysToUtcRange,
} from "@/lib/admin/istanbul-calendar";

/**
 * The numbers behind `/dashboard/ai-concierge`: conversations, the funnel,
 * and the donations the concierge brought in.
 *
 * Two kinds of donation are credited to it:
 *  - direct    the basket went through the concierge (`attribution.ai_concierge`,
 *               set when the assistant put the gift in the basket);
 *  - indirect  the donor had talked to the concierge within the attribution
 *               window before giving, but the basket itself came from elsewhere:
 *               the browser's touch marker (`attribution.ai_concierge_touch`), or a
 *               signed-in donor whose conversation is linked to their account.
 * A donation is counted once: direct wins over indirect.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface ConciergeRange {
  from: Date;
  to: Date;
  startKey: string;
  endKey: string;
}

/** `?from=&to=` (Istanbul calendar days) or `?days=` (default 30). */
export function parseConciergeRange(params: URLSearchParams, defaultDays = 30): ConciergeRange {
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const today = formatIstanbulDateKey(new Date());
  let startKey: string;
  let endKey: string;
  if (fromParam && DATE_KEY.test(fromParam)) {
    startKey = fromParam;
    endKey = toParam && DATE_KEY.test(toParam) ? toParam : today;
    if (endKey < startKey) [startKey, endKey] = [endKey, startKey];
  } else {
    const days = Math.min(730, Math.max(1, Number(params.get("days") ?? defaultDays) || defaultDays));
    endKey = today;
    startKey = addIstanbulCalendarDays(today, -(days - 1));
  }
  const { startDate, endDate } = istanbulDateKeysToUtcRange(startKey, endKey);
  return { from: startDate, to: endDate, startKey, endKey };
}

type Attr = {
  ai_concierge?: { sessionId?: string; intent?: string | null; campaignId?: string | null };
  ai_concierge_touch?: { sessionId?: string; at?: string };
} | null;

export interface AttributedDonation {
  id: string;
  kind: "direct" | "indirect";
  /** How it was linked: basket marker, browser touch, or the donor's account. */
  via: "basket" | "touch" | "account";
  sessionId: string | null;
  usd: number;
  currency: string;
  amount: number;
  createdAt: Date;
  donorId: string;
  recurring: boolean;
}

/**
 * Paid donations created in [from, to] that the concierge brought in, directly
 * or indirectly. `sessionId` narrows it to one conversation (its session's
 * markers, plus its signed-in donor's gifts inside the window).
 */
export async function findAttributedDonations(opts: {
  from: Date;
  to: Date;
  windowDays: number;
  sessionId?: string;
  /** For one conversation: the linked donor and when the chat happened. */
  conversation?: { userId: string | null; startedAt: Date; lastMessageAt: Date };
}): Promise<AttributedDonation[]> {
  const windowMs = opts.windowDays * DAY_MS;
  const select = { id: true, amount: true, amountUSD: true, currency: true, createdAt: true, donorId: true, subscriptionId: true, attribution: true } as const;

  const marked = await prisma.donation.findMany({
    where: { ...PAID_DONATION_FILTER, createdAt: { gte: opts.from, lte: opts.to }, attribution: { not: null as never } },
    select,
  });

  const out = new Map<string, AttributedDonation>();
  const base = (d: (typeof marked)[number]) => ({
    id: d.id,
    usd: donationRowUsdApprox(d),
    currency: d.currency,
    amount: d.amount,
    createdAt: d.createdAt,
    donorId: d.donorId,
    recurring: Boolean(d.subscriptionId),
  });

  for (const d of marked) {
    const a = d.attribution as Attr;
    const direct = a?.ai_concierge?.sessionId;
    if (direct && (!opts.sessionId || direct === opts.sessionId)) {
      out.set(d.id, { ...base(d), kind: "direct", via: "basket", sessionId: direct });
      continue;
    }
    const touch = a?.ai_concierge_touch;
    if (touch?.sessionId && touch.at && (!opts.sessionId || touch.sessionId === opts.sessionId)) {
      const at = new Date(touch.at).getTime();
      const gap = d.createdAt.getTime() - at;
      if (Number.isFinite(at) && gap >= -60_000 && gap <= windowMs) {
        out.set(d.id, { ...base(d), kind: "indirect", via: "touch", sessionId: touch.sessionId });
      }
    }
  }

  /* Signed-in donors whose conversation is on their account. */
  const convs = opts.conversation
    ? opts.conversation.userId
      ? [{ userId: opts.conversation.userId, startedAt: opts.conversation.startedAt, lastMessageAt: opts.conversation.lastMessageAt, sessionId: opts.sessionId ?? null }]
      : []
    : await prisma.aiConciergeConversation.findMany({
        where: { userId: { not: null }, lastMessageAt: { gte: new Date(opts.from.getTime() - windowMs) }, startedAt: { lte: opts.to } },
        select: { userId: true, startedAt: true, lastMessageAt: true, sessionId: true },
      });
  const byUser = new Map<string, Array<{ startedAt: Date; lastMessageAt: Date; sessionId: string | null }>>();
  for (const c of convs) {
    if (!c.userId) continue;
    if (!byUser.has(c.userId)) byUser.set(c.userId, []);
    byUser.get(c.userId)!.push({ startedAt: c.startedAt, lastMessageAt: c.lastMessageAt, sessionId: c.sessionId });
  }
  if (byUser.size) {
    const own = await prisma.donation.findMany({
      where: { ...PAID_DONATION_FILTER, createdAt: { gte: opts.from, lte: opts.to }, donorId: { in: [...byUser.keys()] } },
      select,
    });
    for (const d of own) {
      if (out.has(d.id)) continue;
      const t = d.createdAt.getTime();
      const hit = byUser.get(d.donorId)?.find((c) => t >= c.startedAt.getTime() - 60_000 && t <= c.lastMessageAt.getTime() + windowMs);
      if (hit) out.set(d.id, { ...base(d), kind: "indirect", via: "account", sessionId: hit.sessionId });
    }
  }

  return [...out.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function conciergeOverview(range: ConciergeRange, windowDays: number) {
  const [conversations, events, donations] = await Promise.all([
    prisma.aiConciergeConversation.findMany({
      where: { startedAt: { gte: range.from, lte: range.to } },
      select: {
        id: true,
        sessionId: true,
        locale: true,
        userId: true,
        firstRoute: true,
        turnCount: true,
        userMessageCount: true,
        intents: true,
        campaignIds: true,
        needsHuman: true,
        fallbackCount: true,
        startedAt: true,
        lastMessageAt: true,
      },
    }),
    prisma.aiConciergeEvent.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: { sessionId: true, event: true, campaignId: true, mode: true, createdAt: true },
    }),
    findAttributedDonations({ from: range.from, to: range.to, windowDays }),
  ]);

  /* ── Daily series ── */
  const days = eachIstanbulDateKey(range.startKey, range.endKey);
  const daily = new Map(days.map((k) => [k, { date: k, conversations: 0, messages: 0, opened: 0, directUSD: 0, indirectUSD: 0, directCount: 0, indirectCount: 0 }]));
  for (const c of conversations) {
    const row = daily.get(formatIstanbulDateKey(c.startedAt));
    if (row) {
      row.conversations += 1;
      row.messages += c.userMessageCount;
    }
  }
  const openedByDay = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.event !== "assistant_opened") continue;
    const k = formatIstanbulDateKey(e.createdAt);
    if (!openedByDay.has(k)) openedByDay.set(k, new Set());
    openedByDay.get(k)!.add(e.sessionId);
  }
  for (const [k, s] of openedByDay) {
    const row = daily.get(k);
    if (row) row.opened = s.size;
  }
  for (const d of donations) {
    const row = daily.get(formatIstanbulDateKey(d.createdAt));
    if (!row) continue;
    if (d.kind === "direct") {
      row.directUSD = round2(row.directUSD + d.usd);
      row.directCount += 1;
    } else {
      row.indirectUSD = round2(row.indirectUSD + d.usd);
      row.indirectCount += 1;
    }
  }

  /* ── Funnel (sessions per step, same vocabulary as the funnel API) ── */
  const sessionsByEvent = new Map<string, Set<string>>();
  let modelTurns = 0;
  let fallbackTurns = 0;
  const selected = new Map<string, number>();
  for (const e of events) {
    if (!sessionsByEvent.has(e.event)) sessionsByEvent.set(e.event, new Set());
    sessionsByEvent.get(e.event)!.add(e.sessionId);
    if (e.event === "message_sent" && e.mode) {
      if (e.mode === "llm") modelTurns += 1;
      else if (e.mode === "deterministic") fallbackTurns += 1;
    }
    if (e.event === "campaign_selected" && e.campaignId) selected.set(e.campaignId, (selected.get(e.campaignId) ?? 0) + 1);
  }
  const step = (name: string) => sessionsByEvent.get(name)?.size ?? 0;
  const interacted = new Set<string>();
  for (const name of ["intent_selected", "message_sent"]) for (const id of sessionsByEvent.get(name) ?? []) interacted.add(id);
  const direct = donations.filter((d) => d.kind === "direct");
  const indirect = donations.filter((d) => d.kind === "indirect");
  const paidSessions = new Set(direct.map((d) => d.sessionId).filter(Boolean));
  const funnel = [
    { key: "opened", label: "فتح المساعد", sessions: step("assistant_opened") },
    { key: "interacted", label: "تفاعل (رسالة أو اختيار)", sessions: interacted.size },
    { key: "recommendation_shown", label: "عُرضت عليه مشاريع", sessions: step("recommendation_shown") },
    { key: "campaign_selected", label: "اختار مشروعًا", sessions: step("campaign_selected") },
    { key: "donation_added_to_cart", label: "أضاف للسلة", sessions: step("donation_added_to_cart") },
    { key: "checkout_started", label: "بدأ الدفع", sessions: step("checkout_started") },
    { key: "paid", label: "تبرّع فعلًا (مباشر)", sessions: paidSessions.size },
  ];

  /* ── Breakdowns ── */
  const count = <T,>(items: T[], key: (t: T) => string | string[] | null | undefined) => {
    const m = new Map<string, number>();
    for (const it of items) {
      const k = key(it);
      for (const v of Array.isArray(k) ? k : k ? [k] : []) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const intents = count(conversations, (c) => c.intents);
  const locales = count(conversations, (c) => c.locale);
  const pages = count(conversations, (c) => c.firstRoute ?? "unknown").slice(0, 10);
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, conversations: 0 }));
  for (const c of conversations) {
    const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Istanbul" }).format(c.startedAt));
    if (Number.isFinite(h) && hours[h]) hours[h].conversations += 1;
  }

  const recommended = new Map<string, number>();
  for (const c of conversations) for (const id of c.campaignIds) recommended.set(id, (recommended.get(id) ?? 0) + 1);
  const campaignIds = [...new Set([...recommended.keys(), ...selected.keys()])];
  const titles = campaignIds.length
    ? await prisma.campaign.findMany({ where: { id: { in: campaignIds.slice(0, 300) } }, select: { id: true, title: true } })
    : [];
  const titleOf = new Map(titles.map((t) => [t.id, t.title]));
  const topCampaigns = campaignIds
    .map((id) => ({ id, title: titleOf.get(id) ?? id, shown: recommended.get(id) ?? 0, selected: selected.get(id) ?? 0 }))
    .sort((a, b) => b.shown + b.selected * 3 - (a.shown + a.selected * 3))
    .slice(0, 10);

  const sum = (list: AttributedDonation[]) => round2(list.reduce((s, d) => s + d.usd, 0));
  const totalConversations = conversations.length;
  const engaged = conversations.filter((c) => c.userMessageCount > 0 || c.turnCount > 2).length;
  const flagged = conversations.filter((c) => c.needsHuman);
  const opened = step("assistant_opened");

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), startKey: range.startKey, endKey: range.endKey },
    windowDays,
    kpis: {
      conversations: totalConversations,
      engagedConversations: engaged,
      opened,
      userMessages: conversations.reduce((s, c) => s + c.userMessageCount, 0),
      avgTurns: totalConversations ? round2(conversations.reduce((s, c) => s + c.turnCount, 0) / totalConversations) : 0,
      signedIn: conversations.filter((c) => c.userId).length,
      needsHuman: flagged.length,
      fallbackTurns,
      modelTurns,
      directUSD: sum(direct),
      directCount: direct.length,
      indirectUSD: sum(indirect),
      indirectCount: indirect.length,
      totalUSD: sum(donations),
      totalCount: donations.length,
      averageUSD: donations.length ? round2(sum(donations) / donations.length) : 0,
      recurringCount: donations.filter((d) => d.recurring).length,
      openToPaidRate: opened ? paidSessions.size / opened : 0,
      conversationToDonationRate: totalConversations ? new Set(donations.map((d) => d.sessionId).filter(Boolean)).size / totalConversations : 0,
    },
    daily: [...daily.values()],
    funnel,
    intents,
    locales,
    pages,
    hours,
    topCampaigns,
    attributionMix: [
      { name: "مباشر  من السلة عبر المساعد", value: sum(direct), count: direct.length },
      { name: "غير مباشر  المتصفح نفسه", value: sum(indirect.filter((d) => d.via === "touch")), count: indirect.filter((d) => d.via === "touch").length },
      { name: "غير مباشر  حساب المتبرع", value: sum(indirect.filter((d) => d.via === "account")), count: indirect.filter((d) => d.via === "account").length },
    ],
    recentDonations: donations.slice(0, 12).map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
  };
}

export type ConciergeOverview = Awaited<ReturnType<typeof conciergeOverview>>;
