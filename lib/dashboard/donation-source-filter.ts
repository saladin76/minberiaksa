import { SOURCE_CHANNELS, type SourceChannel } from "../attribution/source-channel";

/** Dashboard filter on the stored, classified source (Donation.sourceChannel). Unknown values are ignored. */

/** "a,b,c" means any of them; one value gives exactly the same condition as before (owner, 2026-11-21). */
function anyOf(raw: string | null | undefined, one: (v: string) => Record<string, unknown> | null): Record<string, unknown> | null {
  const values = [...new Set(String(raw ?? "").split(",").map((v) => v.trim()).filter((v) => v && v !== "all"))];
  if (values.length <= 1) return one(values[0] ?? "");
  const parts = values.map(one).filter((w): w is Record<string, unknown> => w !== null);
  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : { OR: parts };
}

export function donationSourceWhere(value: string | null | undefined): Record<string, unknown> | null {
  return anyOf(value, donationSourceWhereOne);
}

function donationSourceWhereOne(value: string | null | undefined): Record<string, unknown> | null {
  const v = (value ?? "").trim();
  if (!v || v === "all" || !(SOURCE_CHANNELS as readonly string[]).includes(v)) return null;
  return { sourceChannel: v as SourceChannel };
}

export function mergeDonationSourceFilter(where: Record<string, unknown>, value: string | null | undefined): Record<string, unknown> {
  const filter = donationSourceWhere(value);
  return filter ? { AND: [where, filter] } : where;
}
