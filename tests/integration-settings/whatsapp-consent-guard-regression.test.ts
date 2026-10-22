import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function isolated<T>(file: string, dependencies: Record<string, unknown>, env: Record<string, string> = {}) {
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded: { exports: Record<string, unknown> } = { exports: {} };
  new vm.Script(output, { filename: file }).runInNewContext({
    module: loaded,
    exports: loaded.exports,
    process: { env: { DATABASE_URL: "mongodb://127.0.0.1:27017/isolated_test", ...env } },
    require: (id: string) => {
      if (!(id in dependencies)) throw new Error("Unexpected import: " + id);
      return dependencies[id];
    },
  });
  return loaded.exports as T;
}

type SendResult = { outcome: string; reason?: string };
type Dispatcher = {
  sendAutomaticWhatsappMessage: (input: Record<string, unknown>) => Promise<SendResult>;
};

function automaticHarness(
  profile: { doNotContact: boolean; emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean } | null,
  failConsentRead = false,
) {
  let providerCalls = 0;
  const statuses: Array<{ status: string; errorMessage?: string }> = [];
  const dependencies: Record<string, unknown> = {
    "./template-donation-links": {
      donationTemplateValues: async (input: { values: Record<string, unknown> }) => ({ ok: true, values: input.values }),
    },
    "./template-locale-media": { templateLocaleHeader: () => null },
    "./delivery-log-service": {
      createDeliveryRecord: async () => ({ ok: true, data: { id: "delivery" } }),
      markDeliveryStatus: async (_id: string, status: string, detail?: { errorMessage?: string }) => {
        statuses.push({ status, errorMessage: detail?.errorMessage });
        return { ok: true };
      },
    },
    "./provider-router": {
      sendPreparedDelivery: async () => {
        providerCalls += 1;
        return { ok: true, providerMessageId: "provider-id" };
      },
    },
    "./providers/email/client": { EMAIL_PROVIDER_ID: "ELASTIC_EMAIL" },
    "@/lib/messaging/log-sent": { logSentMessage: async () => undefined },
    "./runtime-config": { getActiveMetaWhatsappRuntimeConfig: async () => ({}) },
    "@/lib/prisma": {
      prisma: {
        donorCommunicationProfile: {
          findUnique: async () => {
            if (failConsentRead) throw new Error("database unavailable");
            return profile;
          },
        },
      },
    },
    "./donor-communication-profile-service": { ensureProfilesForUsers: async () => undefined },
    "./providers/meta-whatsapp/parameters": {
      buildMetaComponents: () => ({ ok: true, components: [] }),
    },
  };
  const dispatcher = isolated<Dispatcher>("lib/communication/automatic-message-dispatcher.ts", dependencies, {
    META_WHATSAPP_DIRECT_SEND_ENABLED: "false",
  });
  const input = {
    triggerEvent: "DONATION_PAID",
    templateId: "template",
    templateName: "donation receipt",
    locale: "ar",
    recipientUserId: "donor",
    recipientName: "Donor",
    variables: {},
    recipientPhone: "+905551112233",
    renderedBody: "Donation receipt",
    metaTemplate: {
      name: "donation_receipt",
      language: "ar",
      category: "UTILITY",
      componentsSchema: [],
      scopedNames: [],
      positionalNames: [],
      headerMediaUrl: null,
      headerMediaFilename: null,
      headerLocation: null,
    },
    templateValues: {},
    sender: { id: "sender", phoneNumberId: "phone-number" },
  };
  return {
    send: () => dispatcher.sendAutomaticWhatsappMessage(input),
    state: () => ({ providerCalls, statuses }),
  };
}

test("automatic WhatsApp sends only after an explicit opt-in is present", async () => {
  const blocked = automaticHarness({ doNotContact: false, emailOptIn: true, smsOptIn: true, whatsappOptIn: false });
  const blockedResult = await blocked.send();
  assert.deepEqual(blockedResult, { outcome: "SKIPPED", reason: "WHATSAPP_OPT_IN_REQUIRED" });
  assert.equal(blocked.state().providerCalls, 0);
  assert.equal(blocked.state().statuses.at(-1)?.status, "SKIPPED");

  const allowed = automaticHarness({ doNotContact: false, emailOptIn: true, smsOptIn: true, whatsappOptIn: true });
  const allowedResult = await allowed.send();
  assert.equal(allowedResult.outcome, "SENT");
  assert.equal(allowed.state().providerCalls, 1);
});

test("automatic WhatsApp fails closed when the consent check is unavailable", async () => {
  const harness = automaticHarness(null, true);
  const result = await harness.send();
  assert.deepEqual(result, { outcome: "SKIPPED", reason: "CONSENT_CHECK_UNAVAILABLE" });
  assert.equal(harness.state().providerCalls, 0);
});
