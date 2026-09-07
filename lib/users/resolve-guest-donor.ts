import type { PrismaClient } from "@prisma/client";
import { countryCodeFromPhone } from "@/lib/donations/donor-country-code";

export interface GuestPayload {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  birthdate?: string | null;
  gender?: string | null;
}

export interface ResolvedDonor {
  donorId: string;
  donorName: string | null;
  matched: boolean;
}

interface ResolveOptions {
  preferredLang: string | null;
}

function normalizeGender(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (["male", "m"].includes(v)) return "male";
  if (["female", "f"].includes(v)) return "female";
  return null;
}

function normalizeBirthdate(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  const match = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d > new Date()) return null;
  return v;
}

export async function resolveGuestDonor(
  prisma: PrismaClient,
  guest: GuestPayload,
  opts: ResolveOptions
): Promise<ResolvedDonor> {
  const email = guest.email?.trim().toLowerCase() || null;
  const phone = guest.phone?.trim() || null;
  const name = [guest.firstName, guest.lastName].filter(Boolean).join(" ").trim() || null;
  // Phone-derived country is a stronger signal than IP geo and lets us avoid
  // leaving brand-new donors with an empty `countryCode` (which then defaults
  // to whatever Meta CAPI infers from the request IP — often wrong on mobile
  // carriers and VPNs).
  const countryCode =
    guest.countryCode?.trim().toUpperCase() || countryCodeFromPhone(phone) || null;
  const city = guest.city?.trim() || null;
  const region = guest.region?.trim() || null;
  const birthdate = normalizeBirthdate(guest.birthdate);
  const gender = normalizeGender(guest.gender);

  if (email) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        phone: true,
        countryCode: true,
        city: true,
        region: true,
        birthdate: true,
        gender: true,
      },
    });
    if (existing) {
      await backfillExistingUser(prisma, existing.id, existing, {
        name,
        phone,
        countryCode,
        city,
        region,
        birthdate,
        gender,
      });
      return { donorId: existing.id, donorName: existing.name ?? name, matched: true };
    }
  }

  if (phone) {
    const candidates = await prisma.user.findMany({
      where: { phone },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        countryCode: true,
        city: true,
        region: true,
        birthdate: true,
        gender: true,
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    const chosen = candidates.find((u) => u.password != null) ?? candidates[0] ?? null;
    if (chosen) {
      await backfillExistingUser(prisma, chosen.id, chosen, {
        name: chosen.name ? null : name,
        email: chosen.email ? null : email,
        countryCode,
        city,
        region,
        birthdate,
        gender,
      });
      return { donorId: chosen.id, donorName: chosen.name ?? name, matched: true };
    }
  }

  const created = await prisma.user.create({
    data: {
      email: email ?? undefined,
      name: name ?? "Guest",
      phone: phone ?? undefined,
      countryCode: countryCode ?? undefined,
      city: city ?? undefined,
      region: region ?? undefined,
      birthdate: birthdate ?? undefined,
      gender: gender ?? undefined,
      preferredLang: opts.preferredLang ?? undefined,
    },
    select: { id: true, name: true },
  });

  return { donorId: created.id, donorName: created.name, matched: false };
}

type ExistingShape = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  birthdate?: string | null;
  gender?: string | null;
};

type IncomingShape = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  birthdate?: string | null;
  gender?: string | null;
};

async function backfillExistingUser(
  prisma: PrismaClient,
  userId: string,
  existing: ExistingShape,
  incoming: IncomingShape
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (!existing.name && incoming.name) data.name = incoming.name;
  if (!existing.email && incoming.email) data.email = incoming.email;
  if (!existing.phone && incoming.phone) data.phone = incoming.phone;
  if (!existing.countryCode && incoming.countryCode) data.countryCode = incoming.countryCode;
  if (!existing.city && incoming.city) data.city = incoming.city;
  if (!existing.region && incoming.region) data.region = incoming.region;
  if (!existing.birthdate && incoming.birthdate) data.birthdate = incoming.birthdate;
  if (!existing.gender && incoming.gender) data.gender = incoming.gender;
  if (Object.keys(data).length === 0) return;
  await prisma.user.update({ where: { id: userId }, data });
}
