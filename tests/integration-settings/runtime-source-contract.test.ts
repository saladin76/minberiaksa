import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const operationalFiles = [
  "lib/communication/providers/meta-whatsapp/client.ts",
  "lib/communication/providers/meta-whatsapp/messages.ts",
  "lib/communication/providers/meta-whatsapp/templates.ts",
  "lib/communication/providers/meta-whatsapp/webhooks.ts",
  "lib/communication/providers/elastic-email/client.ts",
  "lib/communication/providers/brevo/sms-client.ts",
  "lib/communication/providers/netgsm/client.ts",
  "lib/communication/providers/email/client.ts",
  "lib/communication/providers/sms/client.ts",
  "lib/communication/provider-router.ts",
  "lib/communication/campaign-send-planner.ts",
  "lib/communication/campaign-send-executor.ts",
  "lib/events/dispatch.ts",
  "app/api/webhooks/meta/whatsapp/route.ts",
  "app/api/webhooks/brevo/transactional/route.ts",
  "app/api/webhooks/elastic-email/route.ts",
  // The three provider test routes that were here lived under app/api/dashboard/operations and
  // were removed with التشغيل. Their credential-handling contract went with them.
  "app/api/templates/email/send/route.ts",
  "app/api/auth/register/route.ts",
  "app/api/auth/resend-otp/route.ts",
];

const credentialNames = [
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_APP_SECRET",
  "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "META_WHATSAPP_BUSINESS_ACCOUNT_ID",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_GRAPH_VERSION",
  "ELASTIC_EMAIL_API_KEY",
  "ELASTIC_EMAIL_SENDER_NAME",
  "ELASTIC_EMAIL_SENDER_EMAIL",
  "ELASTIC_EMAIL_WEBHOOK_SECRET",
  "BREVO_API_KEY",
  "BREVO_SMS_SENDER",
  "BREVO_SMS_WEBHOOK_SECRET",
  "NETGSM_USERCODE",
  "NETGSM_PASSWORD",
  "NETGSM_HEADER",
];

function source(path: string): string { return readFileSync(join(ROOT, path), "utf8"); }

test("operational clients and routes do not read provider credentials directly", () => {
  for (const path of operationalFiles) {
    const text = source(path);
    for (const name of credentialNames) {
      assert.equal(text.includes(`process.env.${name}`), false, `${path} reads ${name} directly`);
      assert.equal(text.includes(`process.env[\"${name}\"]`), false, `${path} reads ${name} directly`);
    }
  }
});

test("active provider router has no Twilio or SendGrid fallback", () => {
  const active = [
    "lib/communication/provider-router.ts",
    "lib/communication/providers/email/client.ts",
    "lib/communication/providers/sms/client.ts",
    "lib/communication/campaign-send-planner.ts",
    "lib/communication/campaign-send-executor.ts",
    "lib/events/dispatch.ts",
  ].map(source).join("\n");
  assert.equal(/TWILIO/i.test(active), false);
  assert.equal(/SENDGRID/i.test(active), false);
});

test("campaign executor resolves one runtime bundle and passes it to sends", () => {
  const text = source("lib/communication/campaign-send-executor.ts");
  assert.equal((text.match(/getActiveCommunicationRuntimeBundle\(\)/g) ?? []).length, 1);
  assert.match(text, /sendPreparedDelivery\([\s\S]*?, runtime\)/);
});

test("test-send tools use runtime configuration and create delivery records", () => {
  for (const path of operationalFiles.filter((item) => item.includes("/providers/") && item.includes("/test"))) {
    const text = source(path);
    assert.match(text, /createDeliveryRecord/);
    assert.match(text, /RuntimeConfig|runtimeConfig/);
  }
});

test("provider webhooks use active runtime helpers and never candidate helpers", () => {
  const meta = source("app/api/webhooks/meta/whatsapp/route.ts") + source("lib/communication/providers/meta-whatsapp/webhooks.ts");
  const brevo = source("app/api/webhooks/brevo/transactional/route.ts");
  const elastic = source("app/api/webhooks/elastic-email/route.ts");
  assert.match(meta, /getActiveMetaWebhookConfig/);
  assert.match(brevo, /getActiveBrevoWebhookSecret/);
  assert.match(elastic, /getActiveElasticEmailWebhookSecret/);
  assert.equal(/Candidate|pending/i.test(meta + brevo + elastic), false);
});

test("email channel routes exclusively through Elastic Email", () => {
  const emailFacade = source("lib/communication/providers/email/client.ts");
  assert.match(emailFacade, /elastic-email/);
  assert.equal(/brevo/i.test(emailFacade), false);

  // Brevo must remain SMS-only: no email endpoint may survive anywhere in its adapter folder.
  const brevoAdapters = ["lib/communication/providers/brevo/sms-client.ts", "lib/communication/providers/brevo/errors.ts", "lib/communication/providers/brevo/types.ts"].map(source).join("\n");
  assert.equal(brevoAdapters.includes("smtp/email"), false);
});

test("Cron remains environment-only and outside integration runtime", () => {
  const cron = source("app/api/cron/communication-run-due/route.ts") + source("lib/communication/cron-auth.ts");
  assert.match(cron, /CRON_SECRET/);
  assert.equal(cron.includes("integrationSettingsService"), false);
  assert.equal(cron.includes("runtime-config"), false);
});
