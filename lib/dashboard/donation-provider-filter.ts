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

/** "a,b,c" means any of them; one value gives exactly the same condition as before (owner, 2026-11-21). */
function anyOf(raw: string | null | undefined, one: (v: string) => Prisma.DonationWhereInput | null): Prisma.DonationWhereInput | null {
  const values = [...new Set(String(raw ?? "").split(",").map((v) => v.trim()).filter((v) => v && v !== "all"))];
  if (values.length <= 1) return one(values[0] ?? "");
  const parts = values.map(one).filter((w): w is Prisma.DonationWhereInput => w !== null);
  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : { OR: parts };
}

export function donationProviderWhere(raw: string | null | undefined): Prisma.DonationWhereInput | null {
  return anyOf(raw, donationProviderWhereOne);
}

function donationProviderWhereOne(raw: string | null | undefined): Prisma.DonationWhereInput | null {
  const value = raw?.trim();
  if (!value || value === "all") return null;
  if (value === "__unset") return { OR: [{ provider: null }, { provider: "" }, { provider: { isSet: false } }] };
  return { provider: value.toUpperCase() };
}

export function mergeDonationProviderFilter(where: Record<string, unknown>, raw: string | null | undefined): Record<string, unknown> {
  const filter = donationProviderWhere(raw);
  return filter ? { AND: [where, filter] } : where;
}
