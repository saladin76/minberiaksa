import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { parseConciergeRange } from "@/lib/ai/concierge/analytics";
import { loadConciergeSettings } from "@/lib/ai/concierge/settings";
import { conversationWhere, donationsBySession, parseConversationFilters } from "@/lib/ai/concierge/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai/concierge/conversations
 *   ?days | from&to, locale, intent, outcome=donated|direct|none, needsHuman=1,
 *   fallback=1, signedIn=1, typedOnly=1, q=text, page, pageSize, format=csv
 *
 * The concierge conversations, newest first, with who (when signed in), what
 * they asked first, and the donation linked to the session if any.
 */

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "aiConcierge");
  if (denied) return denied;

  try {
    const params = request.nextUrl.searchParams;
    const range = parseConciergeRange(params);
    const filters = parseConversationFilters(params);
    const csv = params.get("format") === "csv";
    const pageSize = csv ? 5000 : Math.min(100, Math.max(5, Number(params.get("pageSize") ?? 25) || 25));
    const page = csv ? 1 : Math.max(1, Number(params.get("page") ?? 1) || 1);

    const settings = await loadConciergeSettings();
    /* Always looked up: the list shows a donation badge on each row. */
    const bySession = await donationsBySession(range, settings.attributionWindowDays);
    const where = conversationWhere(range, filters, bySession);

    const [total, rows] = await Promise.all([
      prisma.aiConciergeConversation.count({ where }),
      prisma.aiConciergeConversation.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sessionId: true,
          locale: true,
          userId: true,
          firstRoute: true,
          firstPath: true,
          turnCount: true,
          userMessageCount: true,
          intents: true,
          needsHuman: true,
          fallbackCount: true,
          startedAt: true,
          lastMessageAt: true,
          turns: { select: { role: true, kind: true, text: true } },
        },
      }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => Boolean(v)))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
    const userOf = new Map(users.map((u) => [u.id, u]));

    const items = rows.map((r) => {
      const donations = bySession.get(r.sessionId) ?? [];
      const firstTyped = r.turns.find((t) => t.role === "user" && t.kind === "message") ?? r.turns.find((t) => t.role === "user");
      const lastReply = [...r.turns].reverse().find((t) => t.role === "assistant");
      const u = r.userId ? userOf.get(r.userId) : null;
      return {
        id: r.id,
        sessionId: r.sessionId,
        locale: r.locale,
        user: u ? { id: u.id, name: u.name, email: u.email } : null,
        firstRoute: r.firstRoute,
        firstPath: r.firstPath,
        turnCount: r.turnCount,
        userMessageCount: r.userMessageCount,
        intents: r.intents,
        needsHuman: r.needsHuman,
        fallbackCount: r.fallbackCount,
        startedAt: r.startedAt.toISOString(),
        lastMessageAt: r.lastMessageAt.toISOString(),
        preview: firstTyped?.text.slice(0, 180) ?? null,
        lastReply: lastReply?.text.slice(0, 140) ?? null,
        donation: donations.length
          ? {
              kind: donations.some((d) => d.kind === "direct") ? "direct" : "indirect",
              count: donations.length,
              usd: Math.round(donations.reduce((s, d) => s + d.usd, 0) * 100) / 100,
            }
          : null,
      };
    });

    if (csv) {
      const header = ["started_at", "last_message_at", "locale", "donor", "email", "first_page", "turns", "visitor_messages", "intents", "needs_human", "fallbacks", "donation", "donation_usd", "first_message", "transcript"];
      const lines = [header.join(",")];
      for (const [i, it] of items.entries()) {
        const transcript = rows[i].turns.map((t) => `${t.role === "user" ? "زائر" : "المساعد"}: ${t.text}`).join(" | ");
        lines.push(
          [it.startedAt, it.lastMessageAt, it.locale, it.user?.name ?? "", it.user?.email ?? "", it.firstRoute ?? "", it.turnCount, it.userMessageCount, it.intents.join(" "), it.needsHuman ? "yes" : "", it.fallbackCount, it.donation?.kind ?? "", it.donation?.usd ?? "", it.preview ?? "", transcript]
            .map(csvCell)
            .join(",")
        );
      }
      return new NextResponse("﻿" + lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="concierge-conversations-${range.startKey}_${range.endKey}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ total, page, pageSize, items, range: { startKey: range.startKey, endKey: range.endKey } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/admin/ai/concierge/conversations:", error);
    return NextResponse.json({ error: "تعذّر تحميل المحادثات" }, { status: 500 });
  }
}
