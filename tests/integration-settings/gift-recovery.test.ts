import test from "node:test";
import assert from "node:assert/strict";
import { recoverApprovalBlockedGifts, type RecoverableGift } from "../../lib/donations/gift-recovery";
import { giftFixture } from "./gift-delivery-fixture";
test("only paid gifts definitely blocked on template approval are resumed once per donation", async () => {
  const valid: RecoverableGift = { donationId: "paid-gift", paidAt: new Date(), channels: ["EMAIL", "WHATSAPP"], deliveryState: { EMAIL: { status: "SENT", at: new Date().toISOString() }, WHATSAPP: { status: "FAILED", reason: "GIFT_TEMPLATE_APPROVAL_REQUIRED", at: new Date().toISOString() } } };
  const calls: string[] = [];
  const rows = [valid, valid, { ...valid, paidAt: null }, ...["SENT", "SENDING"].map(status => ({ ...valid, deliveryState: { WHATSAPP: { status, reason: "GIFT_TEMPLATE_APPROVAL_REQUIRED", at: new Date().toISOString() } } })), { ...valid, deliveryState: { WHATSAPP: { status: "FAILED", reason: "DELIVERY_OUTCOME_UNCERTAIN" } } }];
  assert.deepEqual(await recoverApprovalBlockedGifts(rows, async id => { calls.push(id); return { whatsappSent: 1, errors: 0 }; }), { eligible: 1, resumed: 1, failed: 0 });
  assert.deepEqual(calls, ["paid-gift"]);
});
test("recovery uses the existing channel ledger and never resends an accepted email", async () => {
  const fixture = giftFixture({ whatsappFails: true }); await fixture.deliver();
  assert.equal(fixture.emails.length, 1);
  const f = giftFixture();
  f.line.giftDeliveryState = { EMAIL: { status: "SENT", at: new Date().toISOString() }, WHATSAPP: { status: "FAILED", reason: "GIFT_TEMPLATE_APPROVAL_REQUIRED", at: new Date().toISOString() } };
  const result = await recoverApprovalBlockedGifts([{ donationId: "paid", paidAt: new Date(), channels: ["EMAIL", "WHATSAPP"], deliveryState: f.line.giftDeliveryState }], async () => f.deliver());
  assert.equal(result.resumed, 1); assert.equal(f.emails.length, 0); assert.equal(f.whatsapps.length, 1);
  await recoverApprovalBlockedGifts([{ donationId: "paid", paidAt: new Date(), channels: ["EMAIL", "WHATSAPP"], deliveryState: f.line.giftDeliveryState }], async () => f.deliver());
  assert.equal(f.whatsapps.length, 1);
});
