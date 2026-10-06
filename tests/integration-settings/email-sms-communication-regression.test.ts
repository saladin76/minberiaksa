import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("automatic email keeps Elastic Email, suppression, unsubscribe and provider-truth delivery semantics", () => {
  const dispatcher = read("lib/communication/automatic-message-dispatcher.ts");
  const email = read("lib/communication/providers/email/client.ts");
  const delivery = read("lib/communication/delivery-log-service.ts");
  const sync = read("app/api/cron/communication-sync-email-events/route.ts");

  assert.match(dispatcher, /EMAIL_PROVIDER_ID/);
  assert.match(dispatcher, /createDeliveryRecord/);
  assert.match(dispatcher, /sendPreparedDelivery/);
  assert.match(email, /emailSuppressionDecision/);
  assert.match(email, /appendMarketingUnsubscribeFooter/);
  assert.match(email, /List-Unsubscribe/);
  assert.match(delivery, /Cannot mark \$\{status\} without provider acceptance/);
  assert.match(sync, /syncElasticEmailEvents/);
});

test("email and SMS campaigns render real recipient context and retain resumable contact deduplication", () => {
  const executor = read("lib/communication/campaign-send-executor.ts");
  const templates = read("lib/communication/template-compat.ts");
  const planner = read("lib/communication/campaign-send-planner.ts");

  assert.match(executor, /loadContextsForUserIds/);
  assert.match(executor, /DUPLICATE_RECIPIENT_CONTACT/);
  assert.match(executor, /sendPreparedDelivery/);
  assert.match(executor, /sendProgress/);
  assert.match(executor, /sendLease/);
  assert.match(templates, /prisma\.smsTemplate/);
  assert.match(templates, /renderEmailHtml/);
  assert.match(planner, /resolveSmsProviderWithRuntime/);
  assert.match(planner, /NETGSM/);
  assert.match(planner, /BREVO_SMS/);
});

test("automatic SMS is a first-class trigger channel with consent-aware lapsed reminders", () => {
  const schema = read("prisma/schema.prisma");
  const triggerApi = read("app/api/templates/triggers/route.ts");
  const dispatch = read("lib/events/dispatch.ts");
  const lapsed = read("lib/events/donation-lapsed.ts");
  const editor = read("app/(dashboard)/dashboard/templates/_components/TriggerEditorDialog.tsx");

  assert.match(schema, /enum MessageChannel\s*\{[\s\S]*EMAIL[\s\S]*WHATSAPP[\s\S]*SMS[\s\S]*\}/);
  assert.match(triggerApi, /z\.enum\(\["EMAIL", "WHATSAPP", "SMS"\]\)/);
  assert.match(dispatch, /sendAutomaticSmsMessage/);
  assert.match(dispatch, /prisma\.smsTemplate/);
  assert.match(dispatch, /smsSent/);
  assert.match(lapsed, /trigger\.channel === "SMS"/);
  assert.match(lapsed, /donorChannelEligibility/);
  assert.match(editor, /value="SMS"/);
});

test("SMS provider routing preserves geography and marketing purpose", () => {
  const sms = read("lib/communication/providers/sms/client.ts");
  const router = read("lib/communication/provider-router.ts");
  const brevo = read("lib/communication/providers/brevo/sms-client.ts");

  assert.match(sms, /isTurkishNumber/);
  assert.match(sms, /NETGSM_SMS/);
  assert.match(sms, /BREVO_SMS/);
  assert.match(router, /input\.purpose === "MARKETING" \? "marketing" : "transactional"/);
  assert.match(brevo, /unicodeEnabled: true/);
});

test("automatic trigger preflight blocks unusable email and SMS provider setups", () => {
  const preflight = read("lib/communication/trigger-preflight.ts");

  assert.match(preflight, /input\.channel === "EMAIL"/);
  assert.match(preflight, /input\.channel === "SMS"/);
  assert.match(preflight, /runtime\.elasticEmail\.configured/);
  assert.match(preflight, /runtime\.netgsm\.configured/);
  assert.match(preflight, /runtime\.brevoSms\.configured/);
  assert.match(preflight, /PROVIDER_NOT_CONFIGURED/);
});
