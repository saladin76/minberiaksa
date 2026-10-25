import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { historyBefore, historyPage, parseHistoryCursor, type HistorySource } from "@/lib/communication/donor-history";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "messages");
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "INVALID_DONOR" }, { status: 400 });
  const query = request.nextUrl.searchParams;
  const channel = query.get("channel");
  if (channel && !["WHATSAPP", "EMAIL", "SMS"].includes(channel)) return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  let cursor;
  try { cursor = parseHistoryCursor(query.get("cursor")); }
  catch { return NextResponse.json({ error: "INVALID_CURSOR" }, { status: 400 }); }
  try {
    const donor = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true } });
    if (!donor) return NextResponse.json({ error: "DONOR_NOT_FOUND" }, { status: 404 });
    const messageId = query.get("messageId");
    if (messageId) {
      if (!/^[a-f0-9]{24}$/i.test(messageId)) return NextResponse.json({ error: "INVALID_MESSAGE" }, { status: 400 });
      const source = query.get("source");
      if (source !== "delivery" && source !== "legacy") return NextResponse.json({ error: "INVALID_SOURCE" }, { status: 400 });
      const where = { id: messageId, recipientUserId: id };
      const select = { renderedBody: true, renderedSubject: true, channel: true };
      const item = source === "delivery" ? await prisma.communicationDelivery.findFirst({ where, select }) : await prisma.sentMessage.findFirst({ where, select });
      if (!item) return NextResponse.json({ error: "MESSAGE_NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ item }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const select = { id: true, channel: true, status: true, templateName: true, renderedSubject: true, errorMessage: true, providerMessageId: true, createdAt: true } as const;
    const [deliveries, legacy] = await Promise.all([
      prisma.communicationDelivery.findMany({ where: { recipientUserId: id, ...(channel ? { channel } : {}), ...historyBefore(cursor, "delivery") }, select: { ...select, sentAt: true, deliveredAt: true, readAt: true, openedAt: true, clickedAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51 }),
      prisma.sentMessage.findMany({ where: { recipientUserId: id, ...(channel === "EMAIL" || channel === "WHATSAPP" || channel === "SMS" ? { channel } : {}), ...historyBefore(cursor, "legacy") }, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51 }),
    ]);
    const page = historyPage([
      ...deliveries.map((row) => ({ ...row, source: "delivery" as HistorySource })),
      ...legacy.map((row) => ({ ...row, source: "legacy" as HistorySource, sentAt: null, deliveredAt: null, readAt: null, openedAt: null, clickedAt: null })),
    ]);
    // Legacy sends may mirror the new archive. Deduplicate against the entire donor
    // archive, including copies on another page. Cursor advances over raw rows.
    const providerIds = page.items.filter((row) => row.source === "legacy" && row.providerMessageId).map((row) => row.providerMessageId!);
    const mirrors = providerIds.length ? await prisma.communicationDelivery.findMany({ where: { recipientUserId: id, providerMessageId: { in: providerIds } }, select: { channel: true, providerMessageId: true } }) : [];
    const mirrored = new Set(mirrors.map((row) => `${row.channel}:${row.providerMessageId}`));
    const items = page.items.filter((row) => row.source === "delivery" || !row.providerMessageId || !mirrored.has(`${row.channel}:${row.providerMessageId}`));
    return NextResponse.json({ donor, items, next: page.next }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("donor communication history failed", error);
    return NextResponse.json({ error: "HISTORY_UNAVAILABLE" }, { status: 503 });
  }
}
