import type { Prisma } from "@prisma/client";

export const DONATION_PROVIDER_OPTIONS = [
  { value: "CASH", label: "نقدي / كاش" },
  { value: "ALBARAKA", label: "Albaraka" },
  { value: "PAYPAL", label: "PayPal" },
  { value: "STRIPE", label: "Stripe" },
  { value: "CHARITY_GIVING", label: "Charity Giving" },
  { value: "BANK_TRANSFER", label: "BANK_TRANSFER" },
  { value: "PAYFOR", label: "PayFor" },
] as const;

/** Filters stored source metadata only; never invokes or changes a gateway. */
export function donationProviderWhere(raw: string | null | undefined): Prisma.DonationWhereInput | null {
  const value = raw?.trim();
  if (!value || value === "all") return null;
  if (value === "__unset") return { OR: [{ provider: null }, { provider: "" }, { provider: { isSet: false } }] };
  return { provider: value.toUpperCase() };
}

export function mergeDonationProviderFilter(where: Record<string, unknown>, raw: string | null | undefined): Record<string, unknown> {
  const filter = donationProviderWhere(raw);
  return filter ? { AND: [where, filter] } : where;
}
