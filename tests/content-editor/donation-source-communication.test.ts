import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { communicationCampaignRef } from "../../lib/attribution/communication-campaign";

const ID = "6af6ce0f6743493af15b7a39";

test("internal WhatsApp campaign donations resolve to the WhatsApp channel and campaign id", () => {
  const ref = communicationCampaignRef({ utm_source: "whatsapp", utm_medium: "communication", utm_campaign: ID, utm_id: ID });
  assert.deepEqual(ref, { channel: "whatsapp", channelLabel: "واتساب", campaignId: ID });
});

test("campaign id falls back to utm_campaign and ignores non-ObjectId values", () => {
  assert.equal(communicationCampaignRef({ utm_source: "email", utm_medium: "communication", utm_campaign: ID.toUpperCase() })?.campaignId, ID);
  assert.equal(communicationCampaignRef({ utm_source: "sms", utm_medium: "communication", utm_campaign: "winter" })?.campaignId, null);
});

test("ad and organic traffic is not treated as an internal campaign", () => {
  assert.equal(communicationCampaignRef({ utm_source: "google", utm_medium: "cpc", utm_campaign: "grant_tr_search_legacy" }), null);
  assert.equal(communicationCampaignRef({ utm_source: "facebook", utm_medium: "paid_social", utm_id: ID }), null);
  assert.equal(communicationCampaignRef(null), null);
});

test("campaign-name endpoint is read-only, authorized and validates ids", () => {
  const route = fs.readFileSync("app/api/admin/communication-campaign-names/route.ts", "utf8");
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /isRevenueDashboardUser\(session\)/);
  assert.match(route, /\/\^\[a-f0-9\]\{24\}\$\//);
  assert.match(route, /select: \{ id: true, name: true \}/);
});

test("source badge keeps channel on its own line and resolves internal campaign names", () => {
  const badge = fs.readFileSync("components/dashboard/DonationSourceBadge.tsx", "utf8");
  assert.match(badge, /communicationCampaignRef\(attribution\)/);
  assert.match(badge, /useCommunicationCampaignName\(/);
  assert.match(badge, /whitespace-nowrap[^"]*font-semibold/);
});
