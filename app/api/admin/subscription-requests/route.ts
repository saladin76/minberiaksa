import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { requestMatchesPlan, requestHistory, OPEN_REQUEST_STATUSES, CLOSED_REQUEST_STATUSES } from "@/lib/donations/subscription-request-policy";
import { notifySubscriptionRequest } from "@/lib/donations/subscription-requests";
import { runAfterResponse } from "@/lib/events/after-response";
import { auditActorFromDashboardSession } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const status = params.get("status") || "OPEN", kind = params.get("kind");
  const page = Number(params.get("page") || 1), limit = 20;
  const userId = params.get("userId"), subscriptionId = params.get("subscriptionId"), requestId = params.get("requestId");
  if ([userId, subscriptionId, requestId].some(id => id && !/^[a-f0-9]{24}$/i.test(id)) ||
      !["OPEN", ...OPEN_REQUEST_STATUSES, ...CLOSED_REQUEST_STATUSES].includes(status) ||
      kind && !["AMOUNT_CHANGE", "PAUSE", "CANCEL"].includes(kind) || !Number.isSafeInteger(page) || page < 1 || page > 10000)
    return NextResponse.json({ error: "INVALID_REQUEST_FILTER" }, { status: 400 });
  const scope = { ...(userId ? { donorId: userId } : {}), ...(subscriptionId ? { subscriptionId } : {}) };
  const where = { ...scope, ...(requestId ? { id: requestId } : { status: status === "OPEN" ? { in: OPEN_REQUEST_STATUSES } : status, ...(kind ? { kind } : {}) }) };
  const [requests, openCount, total] = await Promise.all([
    prisma.subscriptionServiceRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.subscriptionServiceRequest.count({ where: { ...scope, status: { in: OPEN_REQUEST_STATUSES } } }),
    prisma.subscriptionServiceRequest.count({ where }),
  ]);
  const [donors, plans] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(requests.map(row => row.donorId))] } }, select: { id: true, name: true } }),
    prisma.subscription.findMany({ where: { id: { in: [...new Set(requests.map(row => row.subscriptionId))] } }, select: { id: true, donorId: true, amount: true, currency: true, status: true, nextBillingDate: true } }),
  ]);
  const names = new Map(donors.map(row => [row.id, row.name])), planMap = new Map(plans.map(row => [row.id, row]));
  return NextResponse.json({ requests: requests.map(row => {
    const plan = planMap.get(row.subscriptionId), owned = plan?.donorId === row.donorId ? plan : null;
    return { ...row, activeKey: undefined, history: requestHistory(row.history), donorName: names.get(row.donorId) ?? "", plan: owned, canComplete: requestMatchesPlan(row, owned) };
  }), openCount, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || !/^[a-f0-9]{24}$/i.test(body.id) || !["IN_PROGRESS", "COMPLETED", "REJECTED"].includes(body.status) ||
      typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt)) ||
      typeof body.staffNote !== "string" || body.staffNote.trim().length < 3 || body.staffNote.length > 2000 ||
      typeof body.resolutionNote !== "string" || body.resolutionNote.length > 2000 || body.status === "REJECTED" && body.resolutionNote.trim().length < 3)
    return NextResponse.json({ error: "أدخل حالة الطلب وملاحظة المتابعة والرد المطلوب للمتبرع." }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      const row = await tx.subscriptionServiceRequest.findUnique({ where: { id: body.id } });
      if (!row || !OPEN_REQUEST_STATUSES.includes(row.status) || row.updatedAt.toISOString() !== body.updatedAt) throw new Error("CONFLICT");
      if (body.status === "COMPLETED") {
        const plan = await tx.subscription.findUnique({ where: { id: row.subscriptionId }, select: { amount: true, status: true, currency: true, donorId: true } });
        if (!requestMatchesPlan(row, plan)) throw new Error("NOT_FULFILLED");
      }
      const now = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)), closed = CLOSED_REQUEST_STATUSES.includes(body.status);
      const history = [...requestHistory(row.history), { status: body.status, at: now.toISOString(), actorRole: "TEAM", ...(body.resolutionNote.trim() ? { reply: body.resolutionNote.trim() } : {}) }].slice(-50);
      const changed = await tx.subscriptionServiceRequest.updateMany({
        where: { id: row.id, updatedAt: row.updatedAt, status: { in: OPEN_REQUEST_STATUSES } },
        data: { status: body.status, updatedAt: now, staffNote: body.staffNote.trim(), resolutionNote: body.resolutionNote.trim(), history,
          handledById: session!.user.id, ...(closed ? { activeKey: `closed:${row.id}`, completedAt: now } : {}) },
      });
      if (!changed.count) throw new Error("CONFLICT");
      await tx.auditLog.create({ data: { ...auditActorFromDashboardSession(session!), action: "SUBSCRIPTION_REQUEST_STATUS", entityType: "SubscriptionServiceRequest", entityId: row.id,
        messageAr: "تحديث متابعة طلب تبرع دوري", metadata: { from: row.status, status: body.status, subscriptionId: row.subscriptionId, staffNote: body.staffNote.trim() }, stream: "TEAM" } });
      return { id: row.id, closed, updatedAt: now.toISOString() };
    });
    if (result.closed) runAfterResponse(() => notifySubscriptionRequest(result.id, true));
    return NextResponse.json({ ok: true, billingChanged: false, updatedAt: result.updatedAt });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FULFILLED") return NextResponse.json({ error: "نفّذ التغيير المطلوب من إدارة الاشتراك أولاً، ثم أكّد إنجاز الطلب. حالة الطلب وحدها لا تغيّر الخصومات." }, { status: 409 });
    if (error instanceof Error && error.message === "CONFLICT" || (error as { code?: string }).code === "P2034") return NextResponse.json({ error: "تم تحديث الطلب من مستخدم آخر. أعد التحميل." }, { status: 409 });
    console.error("subscription request update failed", error);
    return NextResponse.json({ error: "تعذّر تحديث الطلب." }, { status: 503 });
  }
}
