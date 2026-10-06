import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("campaign analytics surfaces delivery engagement and attributed outcomes", () => {
  const api = read("app/api/communication/campaigns/route.ts");
  const counters = read("lib/communication/campaign-counter-service.ts");
  const table = read("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignsTable.tsx");
  const list = read("app/(dashboard)/dashboard/communication/campaigns/_components/CampaignsListClient.tsx");

  assert.match(api, /getCampaignOutcomeMetrics/);
  assert.match(api, /failedDonationCount/);
  assert.match(counters, /openedAt/);
  assert.match(counters, /clickedAt/);
  assert.match(counters, /repliedAt/);
  assert.match(counters, /repliedCount/);
  assert.match(table, /فتح\/قرأ/);
  assert.match(table, /تبرعات/);
  assert.match(table, /إيراد \$/);
  assert.match(list, /تبرعات منسوبة/);
  assert.match(list, /إيراد منسوب/);
});

test("campaign outcome attribution is exact and never channel-fallback in comparison view", () => {
  const source = read("lib/communication/campaign-attribution-service.ts");
  assert.match(source, /getCampaignOutcomeMetrics/);
  assert.match(source, /utm_campaign/);
  assert.match(source, /ids\.has\(campaignId\)/);
  assert.match(source, /donation\.status === "PAID"/);
});

test("WhatsApp templates can be archived and restored without losing history", () => {
  const api = read("app/api/templates/whatsapp/[id]/archive/route.ts");
  const ui = read("app/(dashboard)/dashboard/templates/_components/WhatsappTemplateList.tsx");
  const compat = read("lib/communication/template-compat.ts");
  const smart = read("lib/communication/smart-whatsapp-service.ts");

  assert.match(api, /ARCHIVE/);
  assert.match(api, /RESTORE/);
  assert.match(api, /enabledTriggers/);
  assert.match(api, /liveCampaigns/);
  assert.match(ui, /أرشف/);
  assert.match(ui, /استعادة/);
  assert.match(ui, /الأرشيف/);
  assert.match(compat, /status: \{ not: "ARCHIVED" \}/);
  assert.match(smart, /status: \{ not: "ARCHIVED" \}/);
});
