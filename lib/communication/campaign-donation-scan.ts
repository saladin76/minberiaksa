import { COMMUNICATION_UTM_MEDIUM_VALUES } from "./campaign-attribution-matching";

export const COMMUNICATION_DONATION_PAGE_SIZE = 1000;

/** Select IDs on MongoDB before transferring typed financial rows. Never read donor contacts. */
export function communicationDonationScan(cursor?: string) {
  if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) throw new Error("COMMUNICATION_ATTRIBUTION_INVALID_CURSOR");
  return {
    filter: {
      $or: [{ status: "PAID", paidAt: { $ne: null } }, { status: "FAILED" }],
      "attribution.utm_medium": { $regex: "^\\s*(?:" + COMMUNICATION_UTM_MEDIUM_VALUES.join("|") + ")\\s*$", $options: "i" },
      ...(cursor ? { _id: { $gt: { $oid: cursor } } } : {}),
    },
    // Prisma 6 deserializes FindOptions into Rust Duration before converting to MongoDB milliseconds.
    // A numeric maxTimeMS fails in the engine before the query can reach MongoDB.
    // hint: the scan pages by _id; without it MongoDB tried every index for the $or + regex filter and hit the time limit while planning (2026-11-20).
    options: { projection: { _id: 1 }, sort: { _id: 1 }, hint: { _id: 1 }, limit: COMMUNICATION_DONATION_PAGE_SIZE, maxTimeMS: { secs: 15, nanos: 0 } },
  };
}

export function communicationDonationPageIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > COMMUNICATION_DONATION_PAGE_SIZE) throw new Error("COMMUNICATION_ATTRIBUTION_INVALID_PAGE");
  const ids = raw.map(row => {
    const value = row?._id;
    const id = typeof value === "string" ? value : value?.$oid;
    if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) throw new Error("COMMUNICATION_ATTRIBUTION_INVALID_ID");
    return id.toLowerCase();
  });
  if (ids.some((id, index) => index > 0 && id <= ids[index - 1])) throw new Error("COMMUNICATION_ATTRIBUTION_INVALID_ORDER");
  return ids;
}
