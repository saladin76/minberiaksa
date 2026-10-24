import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "badges");
  if (denied) return denied;
  try {
    const lists = await prisma.donorContactList.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { contacts: true } } },
    });
    return NextResponse.json({ lists: lists.map(({ _count, ...list }) => ({ ...list, contactCount: _count.contacts })) });
  } catch (error) {
    console.error("donor list read failed", error);
    return NextResponse.json({ error: "Failed to load donor lists" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "badges");
  if (denied) return denied;
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (!name || name.length > 100 || description.length > 500) {
      return NextResponse.json({ error: "List name is required (up to 100 characters); description is limited to 500" }, { status: 400 });
    }
    const list = await prisma.donorContactList.create({ data: { name, description: description || null } });
    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({ ...actor, action: "DONOR_CONTACT_LIST_CREATE", messageAr: `${actor.actorName ?? "مسؤول"} أنشأ قائمة متبرعين: ${name}`, entityType: "DonorContactList", entityId: list.id });
    return NextResponse.json({ list }, { status: 201 });
  } catch (error) {
    console.error("donor list create failed", error);
    return NextResponse.json({ error: "Failed to create donor list" }, { status: 500 });
  }
}
