import type { PrismaClient } from "@prisma/client";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizeDonorCountryCode(code: string | null | undefined): string | null {
  if (code == null || typeof code !== "string") return null;
  const t = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(t)) return null;
  return t;
}

/** Derive an ISO-3166-1 alpha-2 country from an E.164 phone (e.g. "+9055..." → "TR"). */
export function countryCodeFromPhone(phone: string | null | undefined): string | null {
  if (phone == null || typeof phone !== "string") return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : `+${trimmed}`);
    return normalizeDonorCountryCode(parsed?.country);
  } catch {
    return null;
  }
}

export async function getDonorCountryCodeForSnapshot(
  prisma: PrismaClient,
  donorId: string
): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: donorId },
    select: { countryCode: true, phone: true },
  });
  return normalizeDonorCountryCode(u?.countryCode) ?? countryCodeFromPhone(u?.phone);
}
