import test from "node:test";
import assert from "node:assert/strict";
import { trackedTemplateButtonUrl, trackedTemplateButtons } from "../../lib/communication/tracked-template-draft";
import { campaignTrackingValues } from "../../lib/communication/campaign-message-tracking";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { resolveCommunicationCampaignId } from "../../lib/communication/campaign-attribution-matching";

const campaign = { id: "000000000000000000000007", channel: "WHATSAPP" };
test("a reviewed copy replaces shared static tracking, preserves the localized destination, and resolves to the actual campaign at send time", () => {
  for (const locale of ["ar", "tr", "en", "fr"]) {
    const old = `https://minberiaksa.org/${locale}/bagislar?utm_campaign=shared-old&campaign_id=old&utm_id=old&ref=fixture`;
    const input = [{ type: "URL", text: "Donate", url: old }, { type: "QUICK_REPLY", text: "Stop" }];
    const draft = trackedTemplateButtons(input, locale);
    assert.equal(input[0].url, old, "approved source remains immutable");
    assert.equal(draft.prepared, 1);
    const schema = [{ type: "BUTTONS", buttons: draft.buttons }];
    const values = campaignTrackingValues(schema, { "1": "Donor name" }, campaign);
    const built = buildMetaComponents({ componentsSchema: schema, values });
    assert.ok(built.ok);
    const parameter = built.components[0].parameters[0];
    assert.equal(parameter.type, "text");
    if (parameter.type !== "text") return;
    const url = new URL(draft.buttons[0].url!.replace("{{1}}", parameter.text));
    assert.equal(url.pathname, `/${locale}/bagislar`);
    assert.equal(url.searchParams.get("ref"), "fixture");
    assert.equal(url.searchParams.get("utm_source"), "whatsapp");
    assert.equal(url.searchParams.get("utm_medium"), "communication");
    assert.equal(url.searchParams.get("utm_campaign"), null);
    assert.equal(url.searchParams.get("campaign_id"), null);
    assert.equal(resolveCommunicationCampaignId(Object.fromEntries(url.searchParams), new Set([campaign.id]), new Map()), campaign.id);
    assert.deepEqual(draft.buttons[1], input[1]);
  }
});

test("a new language-specific copy fixes the old language suffix without borrowing body variables", () => {
  const url = trackedTemplateButtonUrl("https://minberiaksa.org/tr/bagislar?language={{1}}", "tr")!;
  assert.ok(url.includes("language=tr"));
  assert.ok(url.endsWith("utm_id={{1}}"));
  assert.equal(trackedTemplateButtonUrl(url, "tr"), url, "preparing an already tracked link is idempotent");
});

test("outside, credential-bearing, private, fragment and unrelated dynamic URLs remain unchanged", () => {
  for (const url of ["https://other.example/donate", "https://minberiaksa.org/ar/success/fixture?t=secret", "https://minberiaksa.org/api/receipt", "https://minberiaksa.org/ar/bagislar#details", "https://minberiaksa.org/ar/bagislar/{{1}}", "https://minberiaksa.org/ar/bagislar?ref={{2}}", "https://user:pass@minberiaksa.org/ar/bagislar"]) {
    assert.equal(trackedTemplateButtonUrl(url, "ar"), null, url);
    const draft = trackedTemplateButtons([{ type: "URL", url }], "ar");
    assert.equal(draft.buttons[0].url, url);
    assert.equal(draft.unchanged, 1);
  }
});
