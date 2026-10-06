import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("automatic Utility/Auth WhatsApp keeps Direct Send primary with approved-template fallback", () => {
  const source = read("lib/communication/automatic-message-dispatcher.ts");
  const direct = source.indexOf("sendDirectTextMessage");
  const fallback = source.indexOf("input.metaTemplate");
  assert.ok(direct >= 0, "automatic dispatcher must keep the Direct Send path");
  assert.ok(fallback >= 0, "automatic dispatcher must keep the Meta template fallback");
  assert.ok(direct < fallback, "Direct Send must be attempted before template fallback");
  assert.match(source, /META_WHATSAPP_DIRECT_SEND_ENABLED/);
  assert.match(source, /authentication/);
  assert.match(source, /utility/);
});

test("one-to-one WhatsApp preserves the 24h free-form path and separates Utility from Marketing", () => {
  const source = read("lib/communication/smart-whatsapp-service.ts");
  assert.match(source, /replyWindow\.open/);
  assert.match(source, /FREEFORM/);
  assert.match(source, /UTILITY/);
  assert.match(source, /MARKETING/);
  assert.match(source, /WHATSAPP_MARKETING_OPT_IN_REQUIRED/);
  assert.match(source, /UTILITY_TEMPLATE_FALLBACK/);
  assert.match(source, /MARKETING_TEMPLATE/);
});

test("smart WhatsApp remains an extension of the existing conversation and sender-routing stack", () => {
  const source = read("lib/communication/smart-whatsapp-service.ts");
  assert.match(source, /sendConversationReply/);
  assert.match(source, /replyWindowFor/);
  assert.match(source, /loadSenderRoutingSnapshot/);
  assert.match(source, /resolveSenderFromSnapshot/);
  assert.match(source, /createDeliveryRecord/);
  assert.match(source, /markDeliveryStatus/);
  assert.match(source, /writeAuditLog/);
});

test("campaign sending keeps pause, quiet hours, daily cap, speed controls and resumable delivery", () => {
  const controls = read("lib/communication/campaign-send-controls.ts");
  const executor = read("lib/communication/campaign-send-executor.ts");

  assert.match(controls, /paused/);
  assert.match(controls, /quietHours/);
  assert.match(controls, /dailyCap/);
  assert.match(controls, /SAFE/);
  assert.match(controls, /BALANCED/);
  assert.match(controls, /FAST/);
  assert.match(controls, /MAX/);

  assert.match(executor, /sendProgress/);
  assert.match(executor, /sendLease/);
  assert.match(executor, /ALREADY_PROCESSED/);
  assert.match(executor, /RESUME/);
  assert.match(executor, /runDueCampaigns/);
});

test("WhatsApp campaigns continue to use Meta-approved language/category truth before send", () => {
  const executor = read("lib/communication/campaign-send-executor.ts");
  assert.match(executor, /resolveVariantForLocale/);
  assert.match(executor, /META_TEMPLATE_CATEGORY_MISMATCH/);
  assert.match(executor, /readiness\.providerTemplateName/);
  assert.match(executor, /readiness\.languageCode/);
});

test("dashboard keeps the simple operator-facing Smart WhatsApp flow", () => {
  const dialog = read("components/dashboard/SmartWhatsappDialog.tsx");
  assert.match(dialog, /رد مباشر/);
  assert.match(dialog, /رسالة خدمة/);
  assert.match(dialog, /رسالة تسويقية/);
  assert.match(dialog, /سجل المحادثة/);
  assert.match(dialog, /Direct Send/);
  assert.match(dialog, /Utility/);
  assert.match(dialog, /Marketing/);
});


test("campaign progress updates preserve live send controls through compare-and-swap", () => {
  const store = read("lib/communication/campaign-metadata-store.ts");
  const executor = read("lib/communication/campaign-send-executor.ts");
  const controlsRoute = read("app/api/communication/campaigns/[id]/controls/route.ts");

  assert.match(store, /updatedAt/);
  assert.match(store, /updateMany/);
  assert.match(store, /expectedStatus/);
  assert.match(executor, /mergeCampaignMetadata/);
  assert.match(executor, /mutateCampaignMetadata/);
  assert.match(executor, /CLAIM_CONFLICT/);
  assert.match(executor, /expectedStatus: "SENDING"/);
  assert.match(controlsRoute, /mutateCampaignMetadata/);
});

test("campaign resume lease is claimed atomically and cannot overwrite cancellation", () => {
  const executor = read("lib/communication/campaign-send-executor.ts");

  assert.match(executor, /leaseClaimed/);
  assert.match(executor, /leaseIsFresh\(currentLease\)/);
  assert.match(executor, /return null/);
  assert.match(executor, /expectedStatus: "SENDING"/);
  assert.match(executor, /never overwrite concurrent campaign cancellation|Concurrent/i);
});
