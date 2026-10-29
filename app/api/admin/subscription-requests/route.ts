import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { requestMatchesPlan } from "@/lib/donations/subscription-request-policy";
import { notifySubscriptionRequest } from "@/lib/donations/subscription-requests";
import { runAfterResponse } from "@/lib/events/after-response";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  const status = request.nextUrl.searchParams.get("status") || "OPEN";
  const where = { status: status === "COMPLETED" ? "COMPLETED" : { in: ["NEW", "IN_PROGRESS"] } };
  const [requests, openCount] = await Promise.all([
    prisma.subscriptionServiceRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.subscriptionServiceRequest.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
  ]);
  const donors = await prisma.user.findMany({ where: { id: { in: [...new Set(requests.map(row => row.donorId))] } }, select: { id: true, name: true } });
  const names = new Map(donors.map(row => [row.id, row.name]));
  return NextResponse.json({ requests: requests.map(row => ({ ...row, activeKey: undefined, donorName: names.get(row.donorId) ?? "" })), openCount }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || !/^[a-f0-9]{24}$/i.test(body.id) || !["IN_PROGRESS", "COMPLETED"].includes(body.status) || typeof body.staffNote !== "string" || body.staffNote.trim().length < 3 || body.staffNote.length > 2000) return NextResponse.json({ error: "أدخل حالة الطلب وملاحظة المتابعة." }, { status: 400 });
  const row = await prisma.subscriptionServiceRequest.findUnique({ where: { id: body.id } });
  if (!row || row.status === "COMPLETED") return NextResponse.json({ error: "الطلب غير موجود أو مكتمل بالفعل." }, { status: 409 });
  if (body.status === "COMPLETED") {
    const plan = await prisma.subscription.findUnique({ where: { id: row.subscriptionId }, select: { amount: true, status: true } });
    if (!requestMatchesPlan(row, plan)) return NextResponse.json({ error: "نفّذ التغيير المطلوب من إدارة الاشتراك أولاً، ثم أكّد إنجاز الطلب. حالة الطلب وحدها لا تغيّر الخصومات." }, { status: 409 });
  }
  const changed = await prisma.subscriptionServiceRequest.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, status: { not: "COMPLETED" } }, data: { status: body.status, staffNote: body.staffNote.trim(), handledById: session!.user.id, ...(body.status === "COMPLETED" ? { activeKey: `completed:${row.id}`, completedAt: new Date() } : {}) } });
  if (!changed.count) return NextResponse.json({ error: "تم تحديث الطلب من مستخدم آخر. أعد التحميل." }, { status: 409 });
  await writeAuditLog({ ...auditActorFromDashboardSession(session!), action: "SUBSCRIPTION_REQUEST_STATUS", entityType: "SubscriptionServiceRequest", entityId: row.id, messageAr: "تحديث متابعة طلب تبرع دوري", metadata: { status: body.status }, stream: "TEAM" });
  if (body.status === "COMPLETED") runAfterResponse(() => notifySubscriptionRequest(row.id, true));
  return NextResponse.json({ ok: true, billingChanged: false });
}
