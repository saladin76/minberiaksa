import test from "node:test";
import assert from "node:assert/strict";
import { parseGiftOrder, giftCardData } from "../../lib/donations/gift-order";

const base = { recipientName: "سارة", recipientPhone: "+905551112233", recipientEmail: "sara@example.org", channels: ["WHATSAPP", "EMAIL"], message: "مبارك" };

test("a gift from the gift page carries its card and delivery time; old gifts are unchanged", () => {
  const old = parseGiftOrder(base);
  assert.ok(old.ok && old.gift && old.gift.card === undefined && old.gift.sendAt === undefined, "old gifts gain no new keys");
  assert.deepEqual(giftCardData(old.ok ? old.gift : null), {}, "an ordinary gift stores nothing new");
  const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const r = parseGiftOrder({ ...base, card: { occasion: "baby", theme: "floral", accent: 1, font: "naskh", signature: "ابنك أحمد", anonymous: false }, sendAt: at });
  assert.ok(r.ok && r.gift);
  if (!r.ok || !r.gift) return;
  assert.deepEqual(r.gift.card, { occasion: "baby", theme: "floral", accent: 1, font: "naskh", signature: "ابنك أحمد", anonymous: false });
  assert.equal(r.gift.sendAt?.toISOString(), at);
  const data = giftCardData(r.gift) as { giftCard?: unknown; giftSendAt?: Date };
  assert.ok(data.giftCard && data.giftSendAt);
});

test("bad cards and impossible times are refused", () => {
  const card = { occasion: "baby", theme: "floral", accent: 1, font: "naskh", signature: null, anonymous: false };
  for (const bad of [{ ...card, occasion: "party" }, { ...card, theme: "neon" }, { ...card, accent: 7 }, { ...card, font: "comic" }])
    assert.equal(parseGiftOrder({ ...base, card: bad }).ok, false);
  assert.equal(parseGiftOrder({ ...base, sendAt: "2020-01-01T00:00:00Z" }).ok, false, "past");
  assert.equal(parseGiftOrder({ ...base, sendAt: new Date(Date.now() + 400 * 86_400_000).toISOString() }).ok, false, "too far");
  assert.equal(parseGiftOrder({ ...base, sendAt: "tomorrow" }).ok, false, "not a date");
});
