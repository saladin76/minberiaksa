import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { donorProfileSchema } from "@/lib/dashboard/donor-profile";
import { DEFAULT_LOCALE } from "@/lib/locales";
import { localeForCountry } from "@/lib/geo/country-to-locale";
import { normalizePhoneE164 } from "@/lib/communication/phone";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "donors");
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  const parsed = donorProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PROFILE", issues: parsed.error.flatten() }, { status: 400 });
  const { updatedAt, ...input } = parsed.data;
  // Staff may maintain donor contact data, but changing a login identity remains admin-only.
  if (input.email !== undefined && session!.user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true, name: true, phone: true, countryCode: true, countryName: true, country: true, region: true, city: true, birthdate: true, gender: true, preferredLang: true } });
    if (!user || user.role !== "DONOR") return NextResponse.json({ error: "DONOR_NOT_FOUND" }, { status: 404 });
    const data = {
      ...input,
      ...(input.phone !== undefined ? { phone: input.phone ? normalizePhoneE164(input.phone) : null } : {}),
      ...(input.countryName !== undefined ? { country: input.countryName || null } : {}),
      ...(input.email !== undefined && input.email !== user.email ? { emailVerified: null } : {}),
    };
    const fields = Object.keys(data).filter(key => key !== "emailVerified" && data[key as keyof typeof data] !== user[key as keyof typeof user]);
    // Profile and contact routing update together; stale forms cannot overwrite newer changes.
    await prisma.$transaction(async tx => {
      const result = await tx.user.updateMany({ where: { id, role: "DONOR", updatedAt: new Date(updatedAt) }, data });
      if (result.count !== 1) throw new Error("PROFILE_CONFLICT");
      const contact = {
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.countryCode !== undefined ? { countryCode: data.countryCode } : {}),
        ...((data.preferredLang !== undefined || data.countryCode !== undefined) ? { preferredLocale: (data.preferredLang !== undefined ? data.preferredLang : user.preferredLang) || localeForCountry(data.countryCode !== undefined ? data.countryCode : user.countryCode) || DEFAULT_LOCALE } : {}),
      };
      // Do not bootstrap consent or overwrite STOP/preferences while editing contact fields.
      await tx.donorCommunicationProfile.updateMany({ where: { userId: id }, data: contact });
      await tx.auditLog.create({ data: { actorId: session!.user.id, actorName: session!.user.name, actorRole: session!.user.role ?? "STAFF",
        action: "DONOR_PROFILE_UPDATE", entityType: "User", entityId: id, stream: "TEAM",
        messageAr: "تم تحديث بيانات المتبرع", messageEn: "Donor profile updated", metadata: { fields, financialRecordsChanged: false } } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "P2002") return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    if (error instanceof Error && error.message === "PROFILE_CONFLICT") return NextResponse.json({ error: "PROFILE_CONFLICT" }, { status: 409 });
    return NextResponse.json({ error: "PROFILE_SAVE_FAILED" }, { status: 503 });
  }
}
