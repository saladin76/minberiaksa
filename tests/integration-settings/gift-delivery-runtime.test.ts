import test from "node:test";
import assert from "node:assert/strict";
import { giftFixture, fixtureModule } from "./gift-delivery-fixture";
import { giftCertificateToken, giftCertificateTokenMatches } from "../../lib/donations/gift-certificate-token";
import { giftChannelsComplete, readGiftDeliveryState } from "../../lib/donations/gift-delivery-state";
import * as locales from "../../lib/locales";

test("legacy gifts with missing Mongo fields are found, sent once per channel and completed", async () => {
  const f = giftFixture(); const result = await f.deliver();
  assert.equal(result.emailsSent, 1); assert.equal(result.whatsappSent, 1); assert.equal(result.errors, 0);
  assert.ok(f.line.giftDeliveredAt); assert.deepEqual(f.pdfNames, ["Recipient"]);
  assert.match(JSON.stringify(f.queries), /isSet/);
  await f.deliver(); assert.equal(f.emails.length, 1); assert.equal(f.whatsapps.length, 1);
  assert.ok(f.whatsapps[0].body.includes("/api/gifts/"));
  assert.ok(!f.whatsapps[0].body.includes("fixture-access-secret"));
});

test("email acceptance does not complete an undelivered WhatsApp gift; retry skips the accepted email", async () => {
  const f = giftFixture({ whatsappFails: true });
  const first = await f.deliver(); assert.equal(first.errors, 1); assert.equal(f.line.giftDeliveredAt, undefined);
  await f.deliver(); assert.equal(f.emails.length, 1); assert.equal(f.whatsapps.length, 2);
  assert.equal(readGiftDeliveryState(f.line.giftDeliveryState).EMAIL?.status, "SENT");
});

test("a failed email does not prevent WhatsApp or mark both channels complete", async () => {
  const f = giftFixture({ emailFails: true }); await f.deliver(); await f.deliver();
  assert.equal(f.emails.length, 2); assert.equal(f.whatsapps.length, 1); assert.equal(f.line.giftDeliveredAt, undefined);
});

test("concurrent confirmation callbacks acquire one gift lease", async () => {
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  const f = giftFixture({ emailGate: gate }); const first = f.deliver();
  for (let i = 0; i < 30 && !f.emails.length; i++) await Promise.resolve();
  const second = await f.deliver(); assert.equal(second.lines, 0);
  release(); await first; assert.equal(f.emails.length, 1); assert.equal(f.whatsapps.length, 1);
});

test("uncertain provider responses remain held for review and are never automatically sent twice", async () => {
  const f = giftFixture({ whatsappThrows: true }); await f.deliver(); await f.deliver();
  assert.equal(f.whatsapps.length, 1); assert.equal(readGiftDeliveryState(f.line.giftDeliveryState).WHATSAPP?.status, "SENDING");
  assert.equal(f.line.giftDeliveredAt, undefined);
});

test("unpaid donations and already delivered legacy gifts never reach a provider", async () => {
  for (const f of [giftFixture({ paid: false }), giftFixture({ row: { giftDeliveredAt: new Date() } })]) {
    await f.deliver(); assert.equal(f.emails.length + f.whatsapps.length, 0);
  }
});

test("routing refusal never falls through to the environment sender", async () => {
  const f = giftFixture({ deniedRouting: true }); const r = await f.deliver();
  assert.equal(r.errors, 2); assert.equal(f.emails.length + f.whatsapps.length, 0); assert.equal(f.line.giftDeliveredAt, undefined);
});

test("a certificate-only dedication is completed without contacting the recipient", async () => {
  const f = giftFixture({ row: { giftChannels: [] } }); await f.deliver();
  assert.ok(f.line.giftDeliveredAt); assert.equal(f.emails.length + f.whatsapps.length, 0);
});

test("all requested channels must be accepted, with unknown channels rejected", () => {
  assert.equal(giftChannelsComplete(["EMAIL", "WHATSAPP"], { EMAIL: { status: "SENT", at: "now" } }), false);
  assert.equal(giftChannelsComplete(["SMS"], {}), false); assert.deepEqual(readGiftDeliveryState({ EMAIL: { status: "fake" } }), {});
});

test("gift certificate tokens are scoped to one item and never equal the donation access token", () => {
  const token = giftCertificateToken("item-a", "donation", "donor-secret")!;
  assert.equal(token.length, 64); assert.ok(giftCertificateTokenMatches(token, token));
  assert.notEqual(token, "donor-secret"); assert.notEqual(token, giftCertificateToken("item-b", "donation", "donor-secret"));
  assert.notEqual(token, giftCertificateToken("item-a", "other", "donor-secret"));
  assert.equal(giftCertificateTokenMatches(token, "bad"), false); assert.equal(giftCertificateTokenMatches(token, "f".repeat(64)), false);
});

test("templates use only the default WhatsApp sender while direct routing keeps other numbers available", () => {
  const router = fixtureModule<{ resolveSender: unknown }>("lib/communication/sender-router.ts", { "@/lib/locales": locales });
  const service = fixtureModule<{ resolveSenderFromSnapshot: (snapshot: unknown, request: unknown) => { ok: boolean; sender?: { id: string }; reason?: string } }>("lib/communication/sender-resolution.ts", {
    "server-only": {}, "./sender-service": {}, "./routing-rule-service": {}, "./runtime-config": {}, "./sender-router": router,
  });
  const senders = [{ id: "default", channel: "WHATSAPP", provider: "META_WHATSAPP", name: "Default", enabled: true, status: "ACTIVE", isDefault: true, priority: 100 },
    { id: "ordinary", channel: "WHATSAPP", provider: "META_WHATSAPP", name: "Ordinary", enabled: true, status: "ACTIVE", isDefault: false, priority: 1 }];
  const snapshot = { channel: "WHATSAPP", channelHasNoSenders: false, senders, rules: [{ channel: "WHATSAPP", senderId: "ordinary", enabled: true }], raw: new Map(senders.map(s => [s.id, s])) };
  for (const locale of locales.SUPPORTED_LOCALES) {
    assert.equal(service.resolveSenderFromSnapshot(snapshot, { purpose: "UTILITY", locale, template: true }).sender?.id, "default");
  }
  assert.equal(service.resolveSenderFromSnapshot(snapshot, { purpose: "UTILITY" }).sender?.id, "ordinary");
  senders[0].enabled = false;
  assert.equal(service.resolveSenderFromSnapshot(snapshot, { purpose: "UTILITY", template: true }).ok, false);
  senders[0].isDefault = false;
  assert.equal(service.resolveSenderFromSnapshot(snapshot, { purpose: "UTILITY", template: true }).reason, "WHATSAPP_DEFAULT_SENDER_REQUIRED");
});
