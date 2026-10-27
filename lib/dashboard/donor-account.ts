/** Registration evidence, independent of checkout activity or email verification. */
export type DonorAccountStatus = "MEMBER" | "GUEST" | "UNKNOWN";

export function donorAccountStatus(user: {
  password?: string | null;
  registeredAt?: Date | string | null;
  emailVerified?: Date | string | null;
  verifiedAt?: Date | string | null;
  _count?: { accounts?: number };
}): DonorAccountStatus {
  if (user.registeredAt || user.password || (user._count?.accounts ?? 0) > 0) return "MEMBER";
  // verifiedAt is also set by guest checkout. It alone never establishes membership.
  return user.verifiedAt && !user.emailVerified ? "GUEST" : "UNKNOWN";
}

/** Mongo nullable fields may be absent on imported rows. */
export function donorAccountWhere(status: DonorAccountStatus): import("@prisma/client").Prisma.UserWhereInput {
  const noPassword = { OR: [{ password: null }, { password: "" }, { password: { isSet: false } }] };
  const noVisit = { OR: [{ verifiedAt: null }, { verifiedAt: { isSet: false } }] };
  const noRegistration = { OR: [{ registeredAt: null }, { registeredAt: { isSet: false } }] };
  const noVerification = { OR: [{ emailVerified: null }, { emailVerified: { isSet: false } }] };
  if (status === "MEMBER") return { OR: [
    { registeredAt: { not: null, isSet: true } },
    { AND: [{ password: { not: null } }, { password: { not: "" } }, { password: { isSet: true } }] },
    { accounts: { some: {} } },
  ] };
  return { AND: [noPassword, noRegistration, { accounts: { none: {} } }, status === "GUEST"
    ? { AND: [{ verifiedAt: { not: null, isSet: true } }, noVerification] }
    : { OR: [noVisit, { emailVerified: { not: null, isSet: true } }] }] };
}
