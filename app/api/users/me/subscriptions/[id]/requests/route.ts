import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/lib/locales";
import { subscriptionRequestKinds } from "@/lib/donations/subscription-request-copy";
import { notifySubscriptionRequest } from "@/lib/donations/subscription-requests";
import { runAfterResponse } from "@/lib/events/after-response";

async function owner(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  return prisma.subscription.findFirst({ where: { id, donorId: session.user.id }, select: { id: true, donorId: true, status: true, amount: true, currency: true } });
}
const safe = (row: { id: string; kind: string; status: string; requestedAmount: number | null; currency: string; note: string; createdAt: Date; completedAt: Date | null }) => ({ id: row.id, kind: row.kind, status: row.status, requestedAmount: row.requestedAmount, currency: row.currency, note: row.note, createdAt: row.createdAt, completedAt: row.completedAt });
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const plan = await owner((await params).id);
  if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const rows = await prisma.subscriptionServiceRequest.findMany({ where: { subscriptionId: plan.id, donorId: plan.donorId }, orderBy: { createdAt: "desc" }, take: 20 });
  return NextResponse.json({ requests: rows.map(safe), plan: { amount: plan.amount, currency: plan.currency, status: plan.status } }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const plan = await owner((await params).id);
  if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (plan.status === "CANCELLED") return NextResponse.json({ error: "PLAN_CANCELLED" }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body || !subscriptionRequestKinds.includes(body.kind) || !isValidLocale(body.locale) || typeof body.note !== "string" || body.note.length > 2000 ||
      body.kind === "AMOUNT_CHANGE" && (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1_000_000 || body.amount === plan.amount)) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const activeKey = `${plan.id}:${body.kind}`;
  const existing = await prisma.subscriptionServiceRequest.findUnique({ where: { activeKey } });
  if (existing) return NextResponse.json({ request: safe(existing), alreadyReceived: true, billingChanged: false });
  try {
    const created = await prisma.subscriptionServiceRequest.create({ data: { subscriptionId: plan.id, donorId: plan.donorId, activeKey, kind: body.kind, locale: body.locale, requestedAmount: body.kind === "AMOUNT_CHANGE" ? body.amount : null, currency: plan.currency, note: body.note.trim() } });
    runAfterResponse(() => notifySubscriptionRequest(created.id));
    return NextResponse.json({ request: safe(created), billingChanged: false }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const duplicate = await prisma.subscriptionServiceRequest.findUnique({ where: { activeKey } });
    if (!duplicate) throw error;
    return NextResponse.json({ request: safe(duplicate), alreadyReceived: true, billingChanged: false });
  }
}
