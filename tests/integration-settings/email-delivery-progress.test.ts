import test from "node:test";
import assert from "node:assert/strict";
import { emailDeliveryProgress } from "../../lib/communication/email-delivery-progress";

test("an observed open counts as delivered without fabricating its missing delivery timestamp", () => {
  const row = { status: "OPENED", openedAt: new Date(), deliveredAt: null };
  const progress = emailDeliveryProgress(row);
  assert.equal(progress.accepted, true);
  assert.equal(progress.delivered, true);
  assert.equal(progress.opened, true);
  assert.equal(progress.clicked, false);
  assert.equal(row.deliveredAt, null);
});

test("a click received before earlier webhooks preserves the complete cumulative funnel", () => {
  assert.deepEqual(emailDeliveryProgress({ status: "SENT", clickedAt: new Date() }), {
    accepted: true, delivered: true, opened: true, clicked: true, failed: false, attempted: true,
  });
});

test("a local failure counts as an attempt but only provider evidence makes it accepted", () => {
  assert.deepEqual(emailDeliveryProgress({ status: "FAILED" }), {
    accepted: false, delivered: false, opened: false, clicked: false, failed: true, attempted: true,
  });
  assert.equal(emailDeliveryProgress({ status: "FAILED", providerMessageId: "provider-id" }).accepted, true);
  assert.equal(emailDeliveryProgress({ status: "BOUNCED" }).accepted, true);
});

test("queued, rendered and skipped emails never inflate accepted counts", () => {
  for (const status of ["DRAFT", "QUEUED", "RENDERED", "SKIPPED"]) {
    const progress = emailDeliveryProgress({ status });
    assert.equal(progress.accepted, false);
    assert.equal(progress.attempted, false);
  }
});
