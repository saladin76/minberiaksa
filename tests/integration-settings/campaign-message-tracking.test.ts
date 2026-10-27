import test from "node:test";
import assert from "node:assert/strict";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { campaignTrackingValues, trackCampaignBody, trackCampaignMetaButtons } from "../../lib/communication/campaign-message-tracking";
import { campaignsNeedingTrackedTemplate, resolveCommunicationCampaignId } from "../../lib/communication/campaign-attribution-matching";

const id = "6ada609ef5c859cf26ebba81";
const campaign = { id, channel: "WHATSAPP" };
const approved = "https://minberiaksa.org/tr/bagislar?utm_source=whatsapp&utm_medium=messaging&utm_campaign=whatsapp-campaign&channel=whatsapp&language={{1}}";

test("a dedicated approved campaign button cannot borrow the donor-name body parameter", () => {
  const schema = [{ type: "BODY", text: "Hello {{1}}" }, { type: "BUTTONS", buttons: [{ type: "URL", url: approved.replace("{{1}}", "tr&utm_id={{1}}") }] }];
  const values = campaignTrackingValues(schema, { "1": "Fixture donor" }, campaign);
  const built = buildMetaComponents({ componentsSchema: schema, values });
  assert.ok(built.ok);
  const body = built.components[0].parameters[0], button = built.components[1].parameters[0];
  assert.ok(body.type === "text" && button.type === "text");
  assert.equal(body.text, "Fixture donor");
  assert.equal(button.text, id);
});

test("an attached companion link cannot conceal a shared static approved button", () => {
  assert.deepEqual(campaignsNeedingTrackedTemplate([
    { campaignId: id, url: approved.replace("{{1}}", "tr"), origin: "whatsapp-template" },
    { campaignId: id, url: `https://minberiaksa.org/tr/bagislar?utm_medium=communication&utm_campaign=${id}` },
  ]), [id]);
  assert.deepEqual(campaignsNeedingTrackedTemplate([{ campaignId: id, url: approved, origin: "whatsapp-template" }]), []);
});

test("the actual messaging URL keeps its approved prefix and language, then resolves the precise campaign", () => {
  const schema = [{ type: "BODY", text: "Hello {{1}}" }, { type: "BUTTONS", buttons: [{ type: "URL", url: approved }] }];
  const built = buildMetaComponents({ componentsSchema: schema, values: { "body.1": "Fixture donor", "button.0.1": "tr" } });
  assert.ok(built.ok);
  const components = trackCampaignMetaButtons({ campaign, componentsSchema: schema, components: built.components });
  const parameter = components[1].parameters[0];
  assert.equal(parameter.type, "text");
  if (parameter.type !== "text") return;
  const final = approved.replace("{{1}}", parameter.text);
  assert.ok(final.startsWith(approved.replace("{{1}}", "tr")));
  const url = new URL(final);
  assert.equal(url.searchParams.get("language"), "tr");
  assert.equal(url.searchParams.get("utm_id"), id);
  assert.equal(resolveCommunicationCampaignId(Object.fromEntries(url.searchParams), new Set([id]), new Map()), id);
  assert.deepEqual(components[0], built.components[0]);
  assert.deepEqual(trackCampaignMetaButtons({ campaign, componentsSchema: schema, components }), components, "retry does not append duplicate tags");
  assert.equal(built.components[1].parameters[0].type === "text" && built.components[1].parameters[0].text, "tr", "input payload stays immutable");
});

test("static, external, credential-bearing and conflicting approved buttons are not modified", () => {
  for (const url of [
    approved.replace("{{1}}", "tr"),
    approved.replace("minberiaksa.org", "other.example"),
    approved.replace("language={{1}}", "t=secret&language={{1}}"),
    approved.replace("language={{1}}", "utm_id=another-campaign&language={{1}}"),
    approved.replace("language={{1}}", "language={{1}}&fixed=value"),
  ]) {
    const schema = [{ type: "BUTTONS", buttons: [{ type: "URL", url }] }];
    const built = buildMetaComponents({ componentsSchema: schema, values: { "button.0.1": "tr" } });
    assert.ok(built.ok);
    assert.deepEqual(trackCampaignMetaButtons({ campaign, componentsSchema: schema, components: built.components }), built.components);
  }
});

test("email and SMS outgoing donation links carry campaign IDs without tagging outside or private links", () => {
  const html = '<a href="/tr/bagislar?ref=existing&amp;language=tr">Donate</a><a href="https://outside.example/donate">Outside</a><a href="/api/receipt?t=secret">Receipt</a>';
  const tracked = trackCampaignBody(html, { id, channel: "EMAIL" });
  const url = new URL(/href="([^"]+)"/.exec(tracked)![1].replace(/&amp;/g, "&"));
  assert.equal(url.searchParams.get("ref"), "existing");
  assert.equal(url.searchParams.get("language"), "tr");
  assert.equal(url.searchParams.get("utm_id"), id);
  assert.equal(url.searchParams.get("utm_source"), "email");
  assert.ok(tracked.includes('href="https://outside.example/donate"'));
  assert.ok(tracked.includes('href="/api/receipt?t=secret"'));
  assert.ok(trackCampaignBody("Donate https://minberiaksa.org/tr/bagislar", { id, channel: "SMS" }).includes(`utm_id=${id}`));
  assert.equal(trackCampaignBody(html, campaign), html, "approved WhatsApp body is not rewritten");
});
