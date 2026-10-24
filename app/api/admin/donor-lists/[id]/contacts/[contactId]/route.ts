import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };
const validId = (id: string) => /^[a-f\d]{24}$/i.test(id);

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "badges");
  if (denied) return denied;
  const { id, contactId } = await params;
  if (!validId(id) || !validId(contactId)) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  try {
    const result = await prisma.donorContactListEntry.deleteMany({ where: { id: contactId, listId: id } });
    if (!result.count) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    await prisma.donorContactList.update({ where: { id }, data: { updatedAt: new Date() } });
    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "DONOR_CONTACT_LIST_CONTACT_DELETE",
      messageAr: (actor.actorName ?? "مسؤول") + " حذف جهة اتصال من قائمة متبرعين",
      entityType: "DonorContactList",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("donor list contact delete failed", error);
    return NextResponse.json({ error: "Failed to remove donor contact" }, { status: 500 });
  }
}
