import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { donorAccountWhere } from "../dashboard/donor-account";
import { maskTickerName, type PublicTickerEntry } from "./public-ticker-display";

/** Public DTOs contain no record ids, contact details, raw names or provider data. */
export async function publicTickerEntries(db: Pick<PrismaClient, "donation" | "user">, config: { showRecentDonations?: boolean; showRegisteredNames?: boolean }, now = new Date()): Promise<PublicTickerEntry[]> {
  const [donations, members] = await Promise.all([
    config.showRecentDonations ? db.donation.findMany({ where: { status: "PAID", paidAt: { gte: new Date(now.getTime() - 24 * 3600000), lte: now } }, orderBy: { paidAt: "desc" }, take: 30, select: { id: true, amount: true, currency: true, paidAt: true, donor: { select: { name: true } } } }) : Promise.resolve([]),
    config.showRegisteredNames ? db.user.findMany({ where: { role: "DONOR", AND: [donorAccountWhere("MEMBER")] }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const key = (source: string, id: string) => createHash("sha256").update("public-ticker:" + source + ":" + id).digest("hex").slice(0, 24);
  return [
    ...donations.filter(row => row.paidAt && Number.isFinite(row.amount) && row.amount > 0 && /^[A-Z]{3}$/.test(row.currency)).map(row => ({ key: key("donation", row.id), source: "DONATION" as const, name: maskTickerName(row.donor?.name), amount: row.amount, currency: row.currency, at: row.paidAt!.toISOString() })),
    ...members.filter(row => row.name?.trim()).map(row => ({ key: key("community", row.id), source: "COMMUNITY" as const, name: maskTickerName(row.name), amount: null, currency: null, at: null })),
  ];
}
