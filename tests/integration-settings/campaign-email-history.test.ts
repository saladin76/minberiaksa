import test from "node:test";
import assert from "node:assert/strict";
import { emailHistoryLinks, emailHistoryLinkScan, EMAIL_HISTORY_LINK_LIMIT } from "../../lib/communication/campaign-email-history";
import { buildUniqueCampaignUtmAliases, resolveCommunicationCampaignId } from "../../lib/communication/campaign-attribution-matching";
const one = "600000000000000000000001", two = "600000000000000000000002", url = "https://minberiaksa.org/ar/bagislar/project?utm_source=email&amp;utm_medium=email&amp;utm_campaign=hotmeals";
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
