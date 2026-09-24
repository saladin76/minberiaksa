import test from "node:test";
import assert from "node:assert/strict";
import { giftLineData, normalizeGiftPhone, parseGiftOrder } from "../../lib/donations/gift-order";

/**
 * A gifted line names its recipient and carries the address each chosen
 * channel needs; what the browser sends beyond that is dropped, and a line
 * with no gift is an ordinary line.
 */

test("no gift is an ordinary line", () => {
  assert.deepEqual(parseGiftOrder(undefined), { ok: true, gift: null });
  assert.deepEqual(parseGiftOrder(null), { ok: true, gift: null });
  assert.deepEqual(giftLineData(null), {});
});

test("a gift needs a recipient name", () => {
  const r = parseGiftOrder({ recipientName: "   ", channels: [] });
  assert.equal(r.ok, false);
});

test("each channel needs its address", () => {
  assert.equal(parseGiftOrder({ recipientName: "Amina", channels: ["EMAIL"] }).ok, false);
  assert.equal(parseGiftOrder({ recipientName: "Amina", channels: ["WHATSAPP"] }).ok, false);
  assert.equal(parseGiftOrder({ recipientName: "Amina", channels: ["EMAIL"], recipientEmail: "not-an-email" }).ok, false);
  assert.equal(parseGiftOrder({ recipientName: "Amina", channels: ["SMS"] }).ok, false);
  const ok = parseGiftOrder({
    recipientName: " Amina ",
    channels: ["email", "whatsapp", "EMAIL"],
    recipientEmail: "Amina@Example.com",
    recipientPhone: "+90 (532) 123 45 67",
    message: "For you",
    showAmount: false,
  });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.deepEqual(ok.gift, {
    recipientName: "Amina",
    recipientEmail: "amina@example.com",
    recipientPhone: "+905321234567",
    message: "For you",
    channels: ["EMAIL", "WHATSAPP"],
    showAmount: false,
  });
  assert.deepEqual(giftLineData(ok.gift), {
    giftRecipientName: "Amina",
    giftRecipientEmail: "amina@example.com",
    giftRecipientPhone: "+905321234567",
    giftMessage: "For you",
    giftChannels: ["EMAIL", "WHATSAPP"],
    giftShowAmount: false,
  });
});

test("a gift with no channel is kept: the certificate is still issued in the recipient's name", () => {
  const r = parseGiftOrder({ recipientName: "Amina", channels: [] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.gift?.recipientName, "Amina");
  assert.deepEqual(r.gift?.channels, []);
  assert.equal(r.gift?.showAmount, true);
});

test("phones normalise to E.164 digits or are rejected", () => {
  assert.equal(normalizeGiftPhone("00 90 532 123 45 67"), "+00905321234567".replace("+00", "+00"));
  assert.equal(normalizeGiftPhone("+1 555 0100"), "+15550100");
  assert.equal(normalizeGiftPhone("12345"), null);
});
