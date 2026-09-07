import { prisma } from "@/lib/prisma";

/**
 * Resolve referral code (from body or cookie) to Referral id. Codes are stored lowercase.
 * Use in API routes only (server-side).
 */
export async function resolveReferralId(referralCode: string | null | undefined): Promise<string | null> {
  if (!referralCode || typeof referralCode !== "string") return null;
  const code = referralCode.trim().toLowerCase();
  if (!code) return null;
  const ref = await prisma.referral.findUnique({
    where: { code },
    select: { id: true },
  });
  return ref?.id ?? null;
}
