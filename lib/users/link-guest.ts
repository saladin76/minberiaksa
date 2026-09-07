import { prisma } from "@/lib/prisma";

/**
 * A "guest" user is one that was created by the donation flow purely to attach
 * a donation to — no password, no OAuth account linked, no session ever
 * established. Merging is only safe against this kind of record.
 */
async function isGuestUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, accounts: { select: { id: true }, take: 1 } },
  });
  if (!u) return false;
  if (u.password) return false;
  if (u.accounts.length > 0) return false;
  return true;
}

export type LinkGuestResult =
  | { ok: true; movedDonations: number; alreadyLinked?: boolean }
  | { ok: false; reason: "TARGET_NOT_FOUND" | "GUEST_NOT_FOUND" | "GUEST_NOT_ELIGIBLE" | "SAME_USER" };

/**
 * Move every relation hanging off `guestUserId` onto `targetUserId`, then
 * delete the guest record. Backfills missing profile fields on the target so
 * we don't lose the phone / country / name the donor provided as a guest.
 *
 * Guarded: refuses to merge anything that already has a password or a linked
 * OAuth account — that would let a caller hijack a real user's donations.
 */
export async function linkGuestUserToTarget(
  guestUserId: string,
  targetUserId: string
): Promise<LinkGuestResult> {
  if (guestUserId === targetUserId) {
    return { ok: true, movedDonations: 0, alreadyLinked: true };
  }

  const [target, guest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true, name: true, email: true, phone: true,
        countryCode: true, countryName: true, country: true,
        city: true, region: true, birthdate: true, gender: true,
        preferredLang: true, image: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: guestUserId },
      select: {
        id: true, name: true, email: true, phone: true,
        countryCode: true, countryName: true, country: true,
        city: true, region: true, birthdate: true, gender: true,
        preferredLang: true, image: true,
      },
    }),
  ]);

  if (!target) return { ok: false, reason: "TARGET_NOT_FOUND" };
  if (!guest) return { ok: false, reason: "GUEST_NOT_FOUND" };

  if (!(await isGuestUser(guestUserId))) {
    return { ok: false, reason: "GUEST_NOT_ELIGIBLE" };
  }

  // Backfill: only set fields on the target that are currently missing — never
  // overwrite something the authenticated user has already filled in.
  const backfill: Record<string, unknown> = {};
  if (!target.phone && guest.phone) backfill.phone = guest.phone;
  if (!target.countryCode && guest.countryCode) backfill.countryCode = guest.countryCode;
  if (!target.countryName && guest.countryName) backfill.countryName = guest.countryName;
  if (!target.country && guest.country) backfill.country = guest.country;
  if (!target.city && guest.city) backfill.city = guest.city;
  if (!target.region && guest.region) backfill.region = guest.region;
  if (!target.birthdate && guest.birthdate) backfill.birthdate = guest.birthdate;
  if (!target.gender && guest.gender) backfill.gender = guest.gender;
  if (!target.preferredLang && guest.preferredLang) backfill.preferredLang = guest.preferredLang;
  if (!target.image && guest.image) backfill.image = guest.image;
  if (!target.name && guest.name) backfill.name = guest.name;

  // Move every relation from guest → target, then drop the guest record.
  // Donor relations don't have onDelete: Cascade, so we re-parent explicitly.
  const movedDonations = await prisma.$transaction(async (tx) => {
    if (Object.keys(backfill).length > 0) {
      await tx.user.update({ where: { id: targetUserId }, data: backfill });
    }

    // Clear email on guest first so we don't trip the @unique constraint when
    // a subsequent update happens to set the same email on the target.
    await tx.user.update({
      where: { id: guestUserId },
      data: { email: null },
    });

    const donations = await tx.donation.updateMany({
      where: { donorId: guestUserId },
      data: { donorId: targetUserId },
    });
    await tx.subscription.updateMany({
      where: { donorId: guestUserId },
      data: { donorId: targetUserId },
    });
    await tx.comment.updateMany({
      where: { userId: guestUserId },
      data: { userId: targetUserId },
    });
    await tx.cartItem.updateMany({
      where: { userId: guestUserId },
      data: { userId: targetUserId },
    });
    await tx.message.updateMany({
      where: { userId: guestUserId },
      data: { userId: targetUserId },
    });
    await tx.creditCard.updateMany({
      where: { userId: guestUserId },
      data: { userId: targetUserId },
    });

    await tx.user.delete({ where: { id: guestUserId } });

    return donations.count;
  }, { timeout: 15000 });

  return { ok: true, movedDonations };
}
