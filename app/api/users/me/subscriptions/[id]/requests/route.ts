import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/lib/locales";
import { subscriptionRequestKinds } from "@/lib/donations/subscription-request-copy";
import { notifySubscriptionRequest } from "@/lib/donations/subscription-requests";
import { requestHistory, OPEN_REQUEST_STATUSES, validReduction } from "@/lib/donations/subscription-request-policy";
import { runAfterResponse } from "@/lib/events/after-response";

async function owner(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !/^[a-f0-9]{24}$/i.test(id)) return null;
  return prisma.subscription.findFirst({ where: { id, donorId: session.user.id }, select: { id: true, donorId: true, status: true, amount: true, currency: true } });
}
const safe = (row: { id: string; kind: string; status: string; requestedAmount: number | null; currency: string; note: string; createdAt: Date; updatedAt: Date; completedAt: Date | null; resolutionNote?: string | null; history?: unknown }) => ({
  id: row.id, kind: row.kind, status: row.status, requestedAmount: row.requestedAmount, currency: row.currency, note: row.note,
  createdAt: row.createdAt, updatedAt: row.updatedAt, completedAt: row.completedAt, resolutionNote: row.resolutionNote ?? "", history: requestHistory(row.history),
});
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const plan = await owner((await params).id);
  if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const rows = await prisma.subscriptionServiceRequest.findMany({ where: { subscriptionId: plan.id, donorId: plan.donorId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
  return NextResponse.json({ requests: rows.map(safe), plan: { amount: plan.amount, currency: plan.currency, status: plan.status } }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const plan = await owner((await params).id);
  if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (plan.status === "CANCELLED") return NextResponse.json({ error: "PLAN_CANCELLED" }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!body || !subscriptionRequestKinds.includes(body.kind) || !isValidLocale(body.locale) || typeof body.note !== "string" || body.note.length > 2000 ||
      body.kind === "AMOUNT_CHANGE" && !validReduction(body.amount, plan.amount)) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const activeKey = `${plan.id}:${body.kind}`;
  const duplicateResponse = (row: Parameters<typeof safe>[0]) => {
    const same = row.requestedAmount === (body.kind === "AMOUNT_CHANGE" ? body.amount : null) && row.note === body.note.trim();
    return NextResponse.json({ request: safe(row), alreadyReceived: true, billingChanged: false, ...(same ? {} : { error: "REQUEST_ALREADY_OPEN" }) }, { status: same ? 200 : 409 });
  };
  const existing = await prisma.subscriptionServiceRequest.findUnique({ where: { activeKey } });
  if (existing) return duplicateResponse(existing);
  try {
    const created = await prisma.subscriptionServiceRequest.create({ data: {
      subscriptionId: plan.id, donorId: plan.donorId, activeKey, kind: body.kind, locale: body.locale,
      requestedAmount: body.kind === "AMOUNT_CHANGE" ? body.amount : null, currency: plan.currency, note: body.note.trim(),
      history: [{ status: "NEW", at: new Date().toISOString(), actorRole: "DONOR" }],
    } });
    runAfterResponse(() => notifySubscriptionRequest(created.id));
    return NextResponse.json({ request: safe(created), billingChanged: false }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const duplicate = await prisma.subscriptionServiceRequest.findUnique({ where: { activeKey } });
    if (!duplicate) throw error;
    return duplicateResponse(duplicate);
  }
}

/** Withdraws the request only. It never changes the recurring plan. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const plan = await owner((await params).id);
  if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || !/^[a-f0-9]{24}$/i.test(body.requestId) || typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt))) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      const row = await tx.subscriptionServiceRequest.findFirst({ where: { id: body.requestId, subscriptionId: plan.id, donorId: plan.donorId } });
      if (!row || !OPEN_REQUEST_STATUSES.includes(row.status) || row.updatedAt.toISOString() !== body.updatedAt) throw new Error("CONFLICT");
      const now = new Date();
      const changed = await tx.subscriptionServiceRequest.updateMany({ where: { id: row.id, donorId: plan.donorId, subscriptionId: plan.id, status: { in: OPEN_REQUEST_STATUSES }, updatedAt: row.updatedAt },
        data: { status: "WITHDRAWN", activeKey: `closed:${row.id}`, completedAt: now, history: [...requestHistory(row.history), { status: "WITHDRAWN", at: now.toISOString(), actorRole: "DONOR" }].slice(-50) } });
      if (!changed.count) throw new Error("CONFLICT");
      await tx.auditLog.create({ data: { actorId: plan.donorId, actorRole: "DONOR", action: "SUBSCRIPTION_REQUEST_WITHDRAWN", entityType: "SubscriptionServiceRequest", entityId: row.id, messageAr: "سحب طلب إدارة تبرع دوري", stream: "DONOR" } });
      return tx.subscriptionServiceRequest.findUniqueOrThrow({ where: { id: row.id } });
    });
    return NextResponse.json({ request: safe(result), billingChanged: false });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT" || (error as { code?: string }).code === "P2034") return NextResponse.json({ error: "REQUEST_CHANGED" }, { status: 409 });
    return NextResponse.json({ error: "REQUEST_FAILED" }, { status: 503 });
  }
}
