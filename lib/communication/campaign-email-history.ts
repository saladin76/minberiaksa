import { publicDonationUrl } from "./campaign-public-url";
import { isCommunicationUtmMedium, type CampaignUtmLink } from "./campaign-attribution-matching";

export const EMAIL_HISTORY_LINK_LIMIT = 10_000;
export const EMAIL_HISTORY_PAGE_SIZE = 200;

/** Extract distinct public hrefs in MongoDB; personalized message bodies and contacts stay in the database. */
export function emailHistoryLinkScan(cursor?: string) {
  if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) throw new Error("COMMUNICATION_EMAIL_HISTORY_INVALID_CURSOR");
  return {
    pipeline: [
      { $match: { channel: "EMAIL", campaignId: { $type: "objectId" }, ...(cursor ? { _id: { $gt: { $oid: cursor } } } : {}) } },
      { $sort: { _id: 1 } },
      { $limit: EMAIL_HISTORY_PAGE_SIZE },
      { $facet: {
        page: [{ $group: { _id: null, count: { $sum: 1 }, lastId: { $last: "$_id" } } }],
        links: [
          { $match: { renderedBody: { $regex: "utm_campaign", $options: "i" } } },
          { $project: { _id: 0, campaignId: 1, urls: { $map: { input: { $regexFindAll: { input: "$renderedBody", regex: "href\\s*=\\s*[\"']((?:https?://(?:www\\.)?minberiaksa\\.org)?/[^\"'\\s<>]*)[\"']", options: "i" } }, as: "link", in: { $arrayElemAt: ["$$link.captures", 0] } } } } },
          { $unwind: "$urls" },
          { $match: { urls: { $regex: "[?&](?:amp;|#38;|#x26;)?utm_campaign=", $options: "i" }, $and: [{ urls: { $not: { $regex: "/(?:api|dashboard|auth|login|receipt|certificates?|success|failure)(?:/|[?])", $options: "i" } } }, { urls: { $not: { $regex: "[?&](?:amp;)?(?:t|token|accessToken|signature|orderId|donationId)=", $options: "i" } } }] } },
          { $group: { _id: { campaignId: "$campaignId", url: "$urls" } } },
          { $limit: EMAIL_HISTORY_LINK_LIMIT + 1 },
        ],
      } },
    ],
    options: { allowDiskUse: true, maxTimeMS: 15_000 },
  };
}

/** Finish every keyset page before proving alias uniqueness. Empty-link pages
 * still advance; a later error rejects the entire financial report. Only public
 * destinations and a delivery cursor leave MongoDB, never personalized HTML. */
export async function loadEmailHistoryLinks(readPage: (scan: ReturnType<typeof emailHistoryLinkScan>) => PromiseLike<unknown>): Promise<CampaignUtmLink[]> {
  const links = new Map<string, CampaignUtmLink>();
  let cursor: string | undefined;
  for (;;) {
    const raw = await readPage(emailHistoryLinkScan(cursor));
    if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] || typeof raw[0] !== "object") throw new Error("COMMUNICATION_EMAIL_HISTORY_INVALID_PAGE");
    const page = raw[0] as { page?: unknown; links?: unknown };
    if (!Array.isArray(page.page) || page.page.length > 1 || !Array.isArray(page.links)) throw new Error("COMMUNICATION_EMAIL_HISTORY_INVALID_PAGE");
    if (!page.page.length) {
      if (page.links.length) throw new Error("COMMUNICATION_EMAIL_HISTORY_INVALID_PAGE");
      break;
    }
    const metadata = page.page[0];
    const next = typeof metadata?.lastId === "string" ? metadata.lastId : metadata?.lastId?.$oid;
    if (!Number.isInteger(metadata?.count) || metadata.count < 1 || metadata.count > EMAIL_HISTORY_PAGE_SIZE || typeof next !== "string" || !/^[a-f0-9]{24}$/.test(next)) throw new Error("COMMUNICATION_EMAIL_HISTORY_INVALID_PAGE");
    if (cursor && next <= cursor) throw new Error("COMMUNICATION_EMAIL_HISTORY_CURSOR_STALLED");
    for (const link of emailHistoryLinks(page.links)) links.set(`${link.campaignId}\0${link.url}`, link);
    if (links.size > EMAIL_HISTORY_LINK_LIMIT) throw new Error("COMMUNICATION_EMAIL_HISTORY_INCOMPLETE");
    if (metadata.count < EMAIL_HISTORY_PAGE_SIZE) break;
    cursor = next;
  }
  return [...links.values()];
}

export function emailHistoryLinks(raw: unknown): CampaignUtmLink[] {
  if (!Array.isArray(raw) || raw.length > EMAIL_HISTORY_LINK_LIMIT) throw new Error("COMMUNICATION_EMAIL_HISTORY_INCOMPLETE");
  const links: CampaignUtmLink[] = [];
  for (const row of raw) {
    const id = row?._id?.campaignId;
    const campaignId = typeof id === "string" ? id : id?.$oid;
    if (typeof campaignId !== "string" || !/^[a-f0-9]{24}$/i.test(campaignId) || typeof row?._id?.url !== "string") throw new Error("COMMUNICATION_EMAIL_HISTORY_INVALID_ROW");
    const url = publicDonationUrl(row._id.url.replace(/&(?:amp|#38|#x26);/gi, "&"));
    if (!url || !isCommunicationUtmMedium(url.searchParams.get("utm_medium")) || !url.searchParams.get("utm_campaign")) continue;
    const destination = new URL(url.origin + url.pathname);
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_id"]) { const value = url.searchParams.get(key); if (value) destination.searchParams.set(key, value); }
    links.push({ campaignId, url: destination.toString(), source: "email", medium: "email", origin: "archived-email" });
  }
  return links;
}
