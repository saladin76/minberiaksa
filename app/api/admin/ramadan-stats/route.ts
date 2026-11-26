import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { ramadanStats } from "@/lib/minbar/ramadan-stats";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** Results of Ramadan scheduling for the dashboard (permission "monthly", as the settings). */
export async function GET() {
  const session = await getServerSession(authOptions), denied = requireAdminOrDashboardPermission(session, "monthly");
  if (denied) return denied;
  try {
    const rows = await prisma.subscription.findMany({ where: { frequency: "RAMADAN" }, select: { id: true, status: true, paymentCardId: true, createdAt: true, donorId: true, scheduleRule: true }, orderBy: { createdAt: "desc" }, take: 5000 });
    const plans = rows.map((r) => ({ id: r.id, status: r.status, hasCard: Boolean(r.paymentCardId), createdAt: r.createdAt, donorId: r.donorId, scheduleRule: r.scheduleRule }));
    const donations = plans.length ? await prisma.donation.findMany({ where: { subscriptionId: { in: plans.map((p) => p.id) } }, select: { subscriptionId: true, status: true, amountUSD: true } }) : [];
    const stats = ramadanStats(plans, donations);
    const recent = plans.slice(0, 20);
    const donorIds = [...new Set(recent.map((p) => p.donorId).filter((id): id is string => Boolean(id)))];
    const [donors, campaigns] = await Promise.all([
      donorIds.length ? prisma.user.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, email: true } }) : [],
      stats.projects.length ? prisma.campaign.findMany({ where: { id: { in: stats.projects.map((p) => p.id) } }, select: { id: true, title: true } }) : [],
    ]);
    const donorById = new Map(donors.map((d) => [d.id, d])), titleById = new Map(campaigns.map((c) => [c.id, c.title]));
    return NextResponse.json({
      stats: { ...stats, projects: stats.projects.map((p) => ({ ...p, title: titleById.get(p.id) ?? null })) },
      recent: recent.map((p) => {
        const rule = (p.scheduleRule ?? {}) as { days?: { amount: number }[]; slot?: string };
        const days = Array.isArray(rule.days) ? rule.days : [];
        const donor = p.donorId ? donorById.get(p.donorId) : null;
        return { id: p.id, createdAt: p.createdAt, donor: donor?.name || donor?.email || null, days: days.length, total: Math.round(days.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100) / 100, slot: rule.slot === "fajr" ? "fajr" : "maghrib", state: p.hasCard ? (p.status === "ACTIVE" ? "confirmed" : p.status === "PAYMENT_FAILED" ? "stopped" : "ended") : p.status === "ACTIVE" ? "awaitingCard" : "abandoned" };
      }),
    }, { headers });
  } catch { return NextResponse.json({ error: "تعذر تحميل نتائج جدولة رمضان" }, { status: 503, headers }); }
}
