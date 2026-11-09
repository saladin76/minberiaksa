import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";

/**
 * Eligibility is tied to an authenticated donor account and payment evidence
 * in THIS site's database. Never trust an email, display name, anonymous
 * donation id, cookie claiming a donor, or IP reputation.
 */
export async function isVerifiedReturningDonor(donationId?: string | null): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const donorId = session?.user?.id;
  if (!donorId || !/^[a-f\d]{24}$/i.test(donorId)) return false;

  // A donor cannot exploit their own trusted account to bypass protection on
  // someone else's existing order. New donation intake has no donationId.
  if (donationId) {
    if (!/^[a-f\d]{24}$/i.test(donationId)) return false;
    const owned = await prisma.donation.findFirst({
      where: { id: donationId, donorId },
      select: { id: true },
    });
    if (!owned) return false;
  }

  const settled = await prisma.donation.findFirst({
    where: { donorId, status: "PAID", paidAt: { not: null } },
    select: { id: true },
  });
  return Boolean(settled);
}

/**
 * Trusted donor exemption applies ONLY to the staged 4+5+3+24 engine.
 * Network velocity caps, manual site restrictions, and emergency maintenance
 * remain active for everyone.
 */
export function bypassProgressiveFraudBlock(trusted: boolean): boolean {
  return trusted;
}
