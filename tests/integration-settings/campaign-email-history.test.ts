import test from "node:test";
import assert from "node:assert/strict";
import { emailHistoryLinks, emailHistoryLinkScan, loadEmailHistoryLinks, EMAIL_HISTORY_LINK_LIMIT, EMAIL_HISTORY_PAGE_SIZE } from "../../lib/communication/campaign-email-history";
import { buildUniqueCampaignUtmAliases, resolveCommunicationCampaignId } from "../../lib/communication/campaign-attribution-matching";
const one = "600000000000000000000001", two = "600000000000000000000002", url = "https://minberiaksa.org/ar/bagislar/project?utm_source=email&amp;utm_medium=email&amp;utm_campaign=hotmeals";
test("the email archive bounds each ordered page before examining personalized HTML", () => {
  const pipeline = emailHistoryLinkScan().pipeline;
  const limit = pipeline.findIndex(stage => "$limit" in stage);
  const sort = pipeline.findIndex(stage => "$sort" in stage);
  assert.ok(sort >= 0 && limit > sort, "keyset sorting and a page limit must precede HTML work");
  assert.doesNotMatch(JSON.stringify(pipeline.slice(0, limit + 1)), /renderedBody|regexFindAll/);
});
test("an archived email destination recovers a unique campaign without retaining personal prefill", () => {
  const links = emailHistoryLinks([{ _id: { campaignId: { $oid: one }, url: url + "&email=fixture%40example.invalid&name=Fixture" } }]);
  assert.equal(resolveCommunicationCampaignId({ utm_source: "email", utm_medium: "email", utm_campaign: "hotmeals" }, new Set([one]), buildUniqueCampaignUtmAliases(links)), one);
  assert.equal(links[0].origin, "archived-email"); assert.equal(new URL(links[0].url).searchParams.has("email"), false); assert.equal(new URL(links[0].url).searchParams.has("name"), false);
});
test("shared email aliases remain unassigned and private/external destinations cannot be recovered", () => {
  const links = emailHistoryLinks([one, two].map(campaignId => ({ _id: { campaignId, url } })));
  assert.equal(resolveCommunicationCampaignId({ utm_source: "email", utm_medium: "email", utm_campaign: "hotmeals" }, new Set([one, two]), buildUniqueCampaignUtmAliases(links)), null);
  for (const value of [url.replace("minberiaksa.org", "other.invalid"), url.replace("/ar/bagislar/project", "/ar/receipt/private?t=secret")]) assert.deepEqual(emailHistoryLinks([{ _id: { campaignId: one, url: value } }]), []);
});
test("a limited or malformed email scan fails instead of presenting incomplete uniqueness or zero income", () => {
  assert.match(JSON.stringify(emailHistoryLinkScan()), /\$regexFindAll/); assert.doesNotMatch(JSON.stringify(emailHistoryLinkScan()), /recipientEmail|recipientUserId/);
  assert.throws(() => emailHistoryLinks(new Array(EMAIL_HISTORY_LINK_LIMIT + 1)), /INCOMPLETE/); assert.throws(() => emailHistoryLinks([{ _id: { campaignId: "bad", url } }]), /INVALID_ROW/);
});

const envelope = (lastId: string, count: number, links: unknown[]) => [{ page: [{ lastId: { $oid: lastId }, count }], links }];
const archivedLink = (campaignId: string, destination = url) => ({ _id: { campaignId: { $oid: campaignId }, url: destination } });
test("a link-free full page still advances and an alias shared on a later page stays unassigned", async () => {
  const pages = [envelope(one, EMAIL_HISTORY_PAGE_SIZE, []), envelope(two, EMAIL_HISTORY_PAGE_SIZE, [archivedLink(one)]), envelope("600000000000000000000003", 1, [archivedLink(two)])];
  const scans: ReturnType<typeof emailHistoryLinkScan>[] = [];
  const links = await loadEmailHistoryLinks(async scan => { scans.push(scan); return pages[scans.length - 1]; });
  assert.equal(scans.length, 3); assert.equal(links.length, 2);
  assert.deepEqual(scans[1].pipeline[0], { $match: { channel: "EMAIL", campaignId: { $type: "objectId" }, _id: { $gt: { $oid: one } } } });
  assert.deepEqual(scans[2].pipeline[0], { $match: { channel: "EMAIL", campaignId: { $type: "objectId" }, _id: { $gt: { $oid: two } } } });
  assert.equal(resolveCommunicationCampaignId({ utm_source: "email", utm_medium: "email", utm_campaign: "hotmeals" }, new Set([one, two]), buildUniqueCampaignUtmAliases(links)), null);
});
test("repeated historical deliveries collapse across pages without dropping later public destinations", async () => {
  const pages = [envelope(one, EMAIL_HISTORY_PAGE_SIZE, [archivedLink(one)]), envelope(two, 2, [archivedLink(one), archivedLink(one, url.replace("hotmeals", "restoration") + "&email=fixture%40example.invalid")])];
  let calls = 0;
  const links = await loadEmailHistoryLinks(async () => pages[calls++]);
  assert.equal(calls, 2); assert.equal(links.length, 2);
  assert.ok(links.every(link => !link.url.includes("email=")));
  assert.equal(resolveCommunicationCampaignId({ utm_source: "email", utm_medium: "email", utm_campaign: "restoration" }, new Set([one]), buildUniqueCampaignUtmAliases(links)), one);
});
test("an exactly full last page requires an empty final page, rather than truncating the archive", async () => {
  let calls = 0;
  const links = await loadEmailHistoryLinks(async () => ++calls === 1 ? envelope(one, EMAIL_HISTORY_PAGE_SIZE, [archivedLink(one)]) : [{ page: [], links: [] }]);
  assert.equal(calls, 2); assert.equal(links.length, 1);
});
test("a later history timeout rejects every partial alias so a report cannot invent revenue", async () => {
  let calls = 0;
  await assert.rejects(loadEmailHistoryLinks(async () => {
    if (++calls === 1) return envelope(one, EMAIL_HISTORY_PAGE_SIZE, [archivedLink(one)]);
    throw new Error("archive query timed out");
  }), /archive query timed out/);
  assert.equal(calls, 2);
});
test("invalid pages, stalled cursors and a global distinct-link overflow fail explicitly", async () => {
  for (const page of [[], [{}], [{ page: [], links: [archivedLink(one)] }], envelope("invalid", 1, []), envelope(one, 0, []), envelope(one, EMAIL_HISTORY_PAGE_SIZE + 1, [])]) {
    await assert.rejects(loadEmailHistoryLinks(async () => page), /INVALID_PAGE/);
  }
  await assert.rejects(loadEmailHistoryLinks(async () => envelope(one, EMAIL_HISTORY_PAGE_SIZE, [])), /CURSOR_STALLED/);
  let calls = 0;
  const first = Array.from({ length: EMAIL_HISTORY_LINK_LIMIT }, (_, i) => archivedLink(one, url.replace("hotmeals", `alias-${i}`)));
  await assert.rejects(loadEmailHistoryLinks(async () => ++calls === 1 ? envelope(one, EMAIL_HISTORY_PAGE_SIZE, first) : envelope(two, 1, [archivedLink(two)])), /INCOMPLETE/);
  assert.throws(() => emailHistoryLinkScan("bad"), /INVALID_CURSOR/);
});
