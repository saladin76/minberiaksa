import { prisma } from "@/lib/prisma";

/**
 * Coming back to an account that was imported from the previous site.
 *
 * Most donors in the database were copied over from the old website: they
 * have a name, an email and a donation history, but no password and no
 * linked Google/Facebook account. When such a donor signs in with Google,
 * registers with the same email, or gives through checkout, they are the same
 * person and must land on that same record  never a second account. What
 * they bring fills the gaps in it; it never overwrites what is already there.
 */

/** Profile fields a sign-in or checkout may fill in when they are empty. */
export interface ProfileFields {
  name?: string | null;
  image?: string | null;
  phone?: string | null;
  birthdate?: string | null;
  gender?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  preferredLang?: string | null;
}

type Existing = { [K in keyof ProfileFields]?: string | null } & { verifiedAt?: Date | null };

/**
 * The user with this email, whatever its case. Imported records kept the old
 * site's spelling (`Ahmed@Gmail.com`), while sign-ins arrive lowercased; an
 * exact match missed them and a duplicate account was created. A record found
 * only by a case-insensitive match has its email lowercased, so the next
 * lookup  including the auth adapter's own exact one  finds it directly.
 */
export async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const exact = await prisma.user.findUnique({ where: { email: normalized } });
  if (exact) return exact;

  const loose = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
  if (!loose) return null;
  try {
    return await prisma.user.update({ where: { id: loose.id }, data: { email: normalized } });
  } catch {
    // Another record already holds the lowercase spelling; use this one as is.
    return loose;
  }
}

/**
 * The update that completes `existing` with `incoming`: only the fields that
 * are empty now, plus `verifiedAt` the first time the person shows up.
 */
export function completionData(existing: Existing, incoming: ProfileFields): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(incoming) as (keyof ProfileFields)[]) {
    const value = incoming[key];
    if (typeof value === "string" && value.trim() && !existing[key]?.toString().trim()) data[key] = value.trim();
  }
  if (!existing.verifiedAt) data.verifiedAt = new Date();
  return data;
}

/**
 * What registering with an imported donor's email carries until the email is
 * confirmed (`OtpCode.payload`), applied by `/api/auth/verify-email`.
 */
export interface AccountClaim {
  passwordHash: string;
  name: string;
  phone: string | null;
  birthdate: string | null;
  gender: string | null;
}
