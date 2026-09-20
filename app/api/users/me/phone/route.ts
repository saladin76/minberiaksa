import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { countryCodeFromPhone } from "@/lib/donations/donor-country-code";

/**
 * PATCH /api/users/me/phone — body `{ phone: "+90…" }`.
 *
 * The checkout asks a signed-in donor for a phone number only until it has
 * one: whatever they type there is stored on their account, so the next
 * checkout pre-fills it and never asks again. The donor may still change it
 * on the form; the change is stored the same way.
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null;
  const phone = typeof body?.phone === "string" ? body.phone.replace(/[^\d+]/g, "").slice(0, 20) : "";
  if (!/^\+?\d{6,}$/.test(phone)) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });

  const current = await prisma.user.findUnique({ where: { id: session.user.id }, select: { phone: true, countryCode: true } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.phone === phone) return NextResponse.json({ phone, changed: false });

  /* A number tells us the country too; fill it in only where nothing is known. */
  const countryCode = current.countryCode ?? countryCodeFromPhone(phone) ?? undefined;
  await prisma.user.update({ where: { id: session.user.id }, data: { phone, ...(countryCode ? { countryCode } : {}) } });
  return NextResponse.json({ phone, changed: true });
}
