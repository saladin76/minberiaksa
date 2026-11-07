import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizeCampaignContact } from "../../lib/communication/campaign-contact-validation";

import * as errors from "../../lib/communication/providers/elastic-email/errors";
import * as payload from "../../lib/communication/providers/elastic-email/payload";
const retryModule = { exports: {} as { retryDefinitelyNotSent: (reason: string) => boolean } };
runInNewContext(ts.transpileModule(readFileSync("lib/communication/retry-recipient-guard.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  module: retryModule, exports: retryModule.exports, require: () => ({}),
});
const { retryDefinitelyNotSent } = retryModule.exports;
test("unassigned dial codes and impossible national lengths never reach campaign providers", () => {
  for (const channel of ["WHATSAPP", "SMS"] as const) {
    for (const phone of ["+999123456789", "+9005551112233", "+9720500000000", "+905551", "+1555123456", "00999 123456789"]) assert.equal(normalizeCampaignContact(channel, phone), null);
    assert.equal(normalizeCampaignContact(channel, "0090 555 111 22 33"), "+905551112233");
  }
  assert.equal(normalizeCampaignContact("EMAIL", "a".repeat(250) + "@example.test"), null);
});
test("explicit email rejections may be retried after repair, while uncertain delivery remains held", () => {
  for (const code of ["ELASTIC_EMAIL_REJECTED", "ELASTIC_EMAIL_UNAUTHORIZED", "ELASTIC_EMAIL_RATE_LIMITED"]) assert.equal(retryDefinitelyNotSent(code), true);
  for (const code of ["ELASTIC_EMAIL_REQUEST_FAILED", "ELASTIC_EMAIL_INVALID_RESPONSE", "TIMEOUT", "DELIVERY_OUTCOME_UNCERTAIN"]) assert.equal(retryDefinitelyNotSent(code), false);
});
test("email error bodies cannot become a successful send merely because HTTP status is 200", async () => {
  const loaded: { exports: Record<string, (input: unknown, runtime: unknown) => Promise<{ ok: boolean; reason?: string }>> } = { exports: {} };
  let body: unknown = { Error: "Access Denied." };
  const dependencies: Record<string, unknown> = {
    "../../runtime-config": { RUNTIME_FAILURE: {}, getActiveElasticEmailRuntimeConfig: () => { throw Error("Unexpected config read"); } },
    "./errors": errors, "./payload": payload,
  };
  runInNewContext(ts.transpileModule(readFileSync("lib/communication/providers/elastic-email/client.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: loaded, exports: loaded.exports, AbortController, setTimeout, clearTimeout, console,
    fetch: async () => new Response(JSON.stringify(body), { status: 200 }),
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  const runtime = { configured: true, values: { apiKey: "fixture-only-key", senderEmail: "sender@example.test", senderName: "Fixture" } };
  const input = { to: "donor@example.test", subject: "Fixture", html: "<p>Fixture</p>" };
  const result = await loaded.exports.sendElasticEmail(input, runtime); assert.equal(result.ok, false); assert.equal(result.reason, "ELASTIC_EMAIL_UNAUTHORIZED");
  body = { success: false, message: "Recipient rejected" }; assert.equal((await loaded.exports.sendElasticEmail(input, runtime)).ok, false);
  body = { MessageID: "fixture-message" }; assert.equal((await loaded.exports.sendElasticEmail(input, runtime)).ok, true);
});

test("all Meta text and template adapters block invalid destinations before configuration or HTTP access", async () => {
  let calls = 0;
  const deps: Record<string, unknown> = {
    "../../campaign-contact-validation": { normalizeCampaignContact },
    "../../runtime-config": { getActiveMetaWhatsappRuntimeConfig: () => { throw Error("Unexpected runtime read"); } },
    "./client": { graphFetch: async () => { calls++; return { ok: true, data: { messages: [{ id: "fixture" }] } }; }, metaRuntimeFailure: () => "NOT_CONFIGURED" },
    "./errors": { META_REASONS: {} },
  };
  const mod = { exports: {} as Record<string, (input: unknown, runtime: unknown) => Promise<{ ok: boolean; reason?: string }>> };
  runInNewContext(ts.transpileModule(readFileSync("lib/communication/providers/meta-whatsapp/messages.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: mod, exports: mod.exports, process: { env: { META_WHATSAPP_DIRECT_SEND_ENABLED: "true" } }, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; },
  });
  const runtime = { configured: true, values: { defaultPhoneNumberId: "fixture" } };
  for (const send of ["sendTextMessage", "sendDirectTextMessage", "sendTemplateMessage"]) {
    const result = await mod.exports[send]({ to: "+9005551112233", body: "Fixture", category: "utility", templateName: "fixture", languageCode: "en" }, runtime);
    assert.equal(result.reason, "INVALID_CONTACT");
  }
  assert.equal(calls, 0);
  assert.equal((await mod.exports.sendTemplateMessage({ to: "+905551112233", templateName: "fixture", languageCode: "en" }, runtime)).ok, true); assert.equal(calls, 1);
});

test("email and SMS channel facades reject malformed contacts before provider calls", async () => {
  for (const [file, name] of [["lib/communication/providers/email/client.ts", "sendEmailMessage"], ["lib/communication/providers/sms/client.ts", "sendSmsMessage"]]) {
    const mod = { exports: {} as Record<string, (input: unknown) => Promise<{ ok: boolean; reason?: string }>> };
    runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      module: mod, exports: mod.exports,
      require: (dep: string) => dep === "../../campaign-contact-validation" ? { normalizeCampaignContact } : dep === "../elastic-email/errors" ? errors : dep === "../netgsm/types" ? { isTurkishNumber: () => true } : {},
    });
    const result = await mod.exports[name]({ to: name === "sendEmailMessage" ? "not-an-email" : "+9005551112233" });
    assert.equal(result.ok, false); assert.equal(result.reason, "INVALID_CONTACT");
  }
});
