import { publicDonationUrl } from "./campaign-public-url";
import { isCommunicationUtmMedium, type CampaignUtmLink } from "./campaign-attribution-matching";

export const EMAIL_HISTORY_LINK_LIMIT = 10_000;

/** Extract distinct public hrefs in MongoDB; personalized message bodies and contacts stay in the database. */
export function emailHistoryLinkScan() {
  return {
    pipeline: [
      { $match: { channel: "EMAIL", campaignId: { $type: "objectId" }, renderedBody: { $regex: "utm_campaign", $options: "i" } } },
      { $project: { _id: 0, campaignId: 1, urls: { $map: { input: { $regexFindAll: { input: "$renderedBody", regex: "href\\s*=\\s*[\"']((?:https?://(?:www\\.)?minberiaksa\\.org)?/[^\"'\\s<>]*)[\"']", options: "i" } }, as: "link", in: { $arrayElemAt: ["$$link.captures", 0] } } } } },
      { $unwind: "$urls" },
      { $match: { urls: { $regex: "[?&](?:amp;|#38;|#x26;)?utm_campaign=", $options: "i" }, $and: [{ urls: { $not: { $regex: "/(?:api|dashboard|auth|login|receipt|certificates?|success|failure)(?:/|[?])", $options: "i" } } }, { urls: { $not: { $regex: "[?&](?:amp;)?(?:t|token|accessToken|signature|orderId|donationId)=", $options: "i" } } }] } },
      { $group: { _id: { campaignId: "$campaignId", url: "$urls" } } },
      { $limit: EMAIL_HISTORY_LINK_LIMIT + 1 },
    ],
    options: { allowDiskUse: true, maxTimeMS: 15_000 },
  };
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
