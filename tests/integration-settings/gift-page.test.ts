import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseGiftSettings } from "../../lib/minbar/gift-settings-validation";
import { giftCartItems, giftDraftProblem, themesFor, type GiftPageDraft } from "../../lib/minbar/gift-page";
import { parseGiftOrder } from "../../lib/donations/gift-order";

const now = new Date("2026-12-01T10:00:00Z");
const base: GiftPageDraft = {
  project: { slug: "water-gaza", title: "سقيا ماء" }, unitUSD: 50,
  recipients: [{ name: "سارة", phone: "+90 532 111 22 33", email: "sara@example.com" }, { name: "  ", phone: "", email: "" }],
  message: "كل عام وأنت بخير", showAmount: false,
  card: { occasion: "eid", theme: "dome", accent: 1, font: "naskh", signature: "أحمد", anonymous: false },
  whatsapp: true, email: true, sendAt: null,
};

test("settings: disabled by default; enabling needs a project or a ready gift", () => {
  assert.equal(parseGiftSettings(null).enabled, false);
  assert.throws(() => parseGiftSettings({ enabled: true, amounts: [50], projectIds: [], packages: [] }));
  const ok = parseGiftSettings({ enabled: true, amounts: [25, 50], projectIds: ["AAAAAAAAAAAAAAAAAAAAAAAA"], packages: [{ projectId: "bbbbbbbbbbbbbbbbbbbbbbbb", price: 50, icon: "water" }] });
  assert.deepEqual(ok.projectIds, ["aaaaaaaaaaaaaaaaaaaaaaaa"]);
  assert.throws(() => parseGiftSettings({ enabled: false, amounts: [50, 50], projectIds: [], packages: [] }));
});

test("a finished gift is one basket row per named recipient, and the order API accepts each", () => {
  const rows = giftCartItems(base);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.freqKey, "once"); assert.equal(row.amount, 50); assert.equal(row.currency, "USD"); assert.equal(row.projectId, "water-gaza");
  assert.deepEqual(row.gift?.channels, ["whatsapp", "email"]);
  const server = parseGiftOrder({ ...row.gift, channels: row.gift!.channels.map(c => c.toUpperCase()) });
  assert.ok(server.ok && server.gift?.card?.occasion === "eid" && server.gift.recipientPhone === "+905321112233");
});

test("WhatsApp and email together; scheduled delivery is kept; anonymous drops the signature", () => {
  const at = new Date(Date.now() + 2 * 86_400_000);
  const [row] = giftCartItems({ ...base, sendAt: at, card: { ...base.card, anonymous: true } });
  assert.equal(row.gift?.sendAt, at.toISOString());
  assert.equal(row.gift?.card?.signature, null);
});

test("problems are reported in the order the donor fills the page", () => {
  assert.equal(giftDraftProblem({ ...base, unitUSD: 0 }, now)?.code, "amount");
  assert.equal(giftDraftProblem({ ...base, recipients: [{ name: "", phone: "", email: "" }] }, now)?.code, "name");
  assert.equal(giftDraftProblem({ ...base, whatsapp: false, email: false }, now)?.code, "channel");
  assert.deepEqual(giftDraftProblem({ ...base, recipients: [{ name: "علي", phone: "123", email: "a@b.co" }] }, now), { code: "phone", recipient: "علي" });
  assert.equal(giftDraftProblem({ ...base, sendAt: new Date(now.getTime() + 60_000) }, now)?.code, "date");
  assert.equal(giftDraftProblem(base, now), null);
});

test("a remembrance gift keeps to quiet designs", () => {
  assert.deepEqual(themesFor("memory"), ["calm", "arabesque"]);
});

test("the page is hidden until enabled and every locale has its texts", () => {
  const route = fs.readFileSync("app/[locale]/gift/page.tsx", "utf8");
  assert.match(route, /if \(!settings\.enabled && !admin\) notFound\(\);/);
  const ar = JSON.parse(fs.readFileSync("i18n/messages/ar.json", "utf8")).giftPage;
  for (const file of fs.readdirSync("i18n/messages").filter(f => f.endsWith(".json"))) {
    const page = JSON.parse(fs.readFileSync(`i18n/messages/${file}`, "utf8")).giftPage;
    assert.ok(page, file);
    assert.deepEqual(Object.keys(page).sort(), Object.keys(ar).sort(), file);
  }
});
