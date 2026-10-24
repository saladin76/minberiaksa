import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { normalizeDonorListContact, type NormalizedDonorListContact } from "@/lib/donor-lists/core";

type RouteContext = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[a-f\d]{24}$/i.test(id);

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "badges");
  if (denied) return denied;
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Donor list not found" }, { status: 404 });
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const take = 250;
  try {
    const [list, total, contacts] = await Promise.all([
      prisma.donorContactList.findUnique({ where: { id }, select: { id: true, name: true } }),
      prisma.donorContactListEntry.count({ where: { listId: id } }),
      prisma.donorContactListEntry.findMany({
        where: { listId: id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
        select: { id: true, name: true, email: true, phone: true, createdAt: true },
      }),
    ]);
    if (!list) return NextResponse.json({ error: "Donor list not found" }, { status: 404 });
    return NextResponse.json({ list, contacts, total, page, pageSize: take, hasMore: page * take < total });
  } catch (error) {
    console.error("donor list contacts read failed", error);
    return NextResponse.json({ error: "Failed to load donor contacts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "badges");
  if (denied) return denied;
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Donor list not found" }, { status: 404 });
  try {
    const body = await request.json();
    if (!Array.isArray(body?.contacts) || body.contacts.length < 1 || body.contacts.length > 250) {
      return NextResponse.json({ error: "Submit between 1 and 250 contacts at a time" }, { status: 400 });
    }
    const inputContacts: unknown[] = body.contacts;
    const list = await prisma.donorContactList.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!list) return NextResponse.json({ error: "Donor list not found" }, { status: 404 });

    const normalized: Array<NormalizedDonorListContact | null> = inputContacts.map((value: unknown) => normalizeDonorListContact(value));
    const invalidIndex = normalized.findIndex((row: NormalizedDonorListContact | null) => !row);
    if (invalidIndex >= 0) return NextResponse.json({ error: "Contact " + (invalidIndex + 1) + " has invalid details" }, { status: 400 });

    const rows = normalized as NonNullable<(typeof normalized)[number]>[];
    const inputSeen = new Set<string>();
    const uniqueRows = rows.filter((row) => {
      const keys = [row.normalizedEmail && "e:" + row.normalizedEmail, row.normalizedPhone && "p:" + row.normalizedPhone].filter(Boolean) as string[];
      if (keys.some((key) => inputSeen.has(key))) return false;
      keys.forEach((key) => inputSeen.add(key));
      return true;
    });
    const emails = [...new Set(uniqueRows.map((row) => row.normalizedEmail).filter((value): value is string => Boolean(value)))];
    const phones = [...new Set(uniqueRows.map((row) => row.normalizedPhone).filter((value): value is string => Boolean(value)))];
    const existing: Array<{ normalizedEmail: string | null; normalizedPhone: string | null }> = emails.length || phones.length
      ? await prisma.donorContactListEntry.findMany({
          where: { listId: id, OR: [
            ...(emails.length ? [{ normalizedEmail: { in: emails } }] : []),
            ...(phones.length ? [{ normalizedPhone: { in: phones } }] : []),
          ] },
          select: { normalizedEmail: true, normalizedPhone: true },
        })
      : [];
    const existingKeys = new Set(existing.flatMap((row) => [
      row.normalizedEmail && "e:" + row.normalizedEmail,
      row.normalizedPhone && "p:" + row.normalizedPhone,
    ].filter(Boolean) as string[]));
    const toCreate = uniqueRows.filter((row) => {
      const keys = [row.normalizedEmail && "e:" + row.normalizedEmail, row.normalizedPhone && "p:" + row.normalizedPhone].filter(Boolean) as string[];
      if (keys.some((key) => existingKeys.has(key))) return false;
      keys.forEach((key) => existingKeys.add(key));
      return true;
    });
    if (toCreate.length) {
      await prisma.donorContactListEntry.createMany({ data: toCreate.map((row) => ({ listId: id, ...row })) });
      await prisma.donorContactList.update({ where: { id }, data: { updatedAt: new Date() } });
    }
    const skipped = inputContacts.length - toCreate.length;
    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "DONOR_CONTACT_LIST_IMPORT",
      messageAr: (actor.actorName ?? "مسؤول") + " أضاف " + toCreate.length + " جهة اتصال إلى قائمة: " + list.name + " (تجاوز " + skipped + " مكررًا)",
      entityType: "DonorContactList",
      entityId: id,
      metadata: { insertedCount: toCreate.length, skippedCount: skipped },
    });
    return NextResponse.json({ inserted: toCreate.length, skipped, listId: id });
  } catch (error) {
    console.error("donor list contacts import failed", error);
    return NextResponse.json({ error: "Failed to add donor contacts" }, { status: 500 });
  }
}
