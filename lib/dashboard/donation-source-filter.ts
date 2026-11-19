import { SOURCE_CHANNELS, type SourceChannel } from "../attribution/source-channel";

/** Dashboard filter on the stored, classified source (Donation.sourceChannel). Unknown values are ignored. */
export function donationSourceWhere(value: string | null | undefined): Record<string, unknown> | null {
  const v = (value ?? "").trim();
  if (!v || v === "all" || !(SOURCE_CHANNELS as readonly string[]).includes(v)) return null;
  return { sourceChannel: v as SourceChannel };
}

export function mergeDonationSourceFilter(where: Record<string, unknown>, value: string | null | undefined): Record<string, unknown> {
  const filter = donationSourceWhere(value);
  return filter ? { AND: [where, filter] } : where;
}
