import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseGiftSettings } from "../../lib/minbar/gift-settings-validation";
import { giftCartItems, giftDraftProblem, themesFor, waqfUnitsFor, type GiftPageDraft } from "../../lib/minbar/gift-page";
import { parseGiftOrder } from "../../lib/donations/gift-order";

const now = new Date("2026-12-01T10:00:00Z");
const card = { occasion: "memory" as const, theme: "ivory" as const, accent: 1 as const, font: "ruqaa" as const, signature: "أحمد", anonymous: false, layout: "center" as const, pattern: false, size: "l" as const, headline: "إلى أمي", showLogo: true, showSeal: false };
const base: GiftPageDraft = {
  choice: { kind: "project", slug: "water-gaza", title: "سقيا ماء", valueUSD: 75 },
  recipients: [{ name: "سارة", phone: "+90 532 111 22 33", email: "sara@example.com" }, { name: " ", phone: "", email: "" }],
  message: "اللهم اغفر له", showAmount: false, card, giverName: "أحمد", whatsapp: true, email: true, sendAt: null,
};

test("settings: disabled by default, no value invented; enabling needs values and a gift", () => {
  const d = parseGiftSettings(null);
  assert.equal(d.enabled, false); assert.deepEqual(d.amounts, []); assert.deepEqual(d.impactGifts, []);
  assert.throws(() => parseGiftSettings({ ...d, enabled: true }));
  const ok = parseGiftSettings({ enabled: true, amounts: [50, 100], waqf: { share: true, meter: false, intentions: ["memory"] }, openProjectId: null,
    impactGifts: [{ id: "water", projectId: "AAAAAAAAAAAAAAAAAAAAAAAA", icon: "water", name: { ar: "سقيا ماء", en: "", tr: "" }, note: { ar: "", en: "", tr: "" }, intentions: ["baby", "baby"] }] });
  assert.equal(ok.impactGifts[0].projectId, "aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(ok.impactGifts[0].intentions, ["baby"]);
});

test("settings saved before the catalog open disabled instead of breaking the page", () => {
  const old = parseGiftSettings({ enabled: true, amounts: [25, 50], projectIds: ["aaaaaaaaaaaaaaaaaaaaaaaa"], packages: [] });
  assert.equal(old.enabled, false); assert.deepEqual(old.amounts, [25, 50]);
});

test("an impact gift is one project row per recipient, accepted by the order API with the full card", () => {
  const rows = giftCartItems(base);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.typeKey, "project"); assert.equal(row.amount, 75); assert.equal(row.projectId, "water-gaza");
  const server = parseGiftOrder({ ...row.gift, channels: row.gift!.channels.map(c => c.toUpperCase()) });
  assert.ok(server.ok && server.gift?.card);
  assert.equal(server.ok && server.gift?.card?.font, "ruqaa");
  assert.equal(server.ok && server.gift?.card?.headline, "إلى أمي");
  assert.equal(server.ok && server.gift?.card?.showSeal, false);
});

test("a waqf gift is a waqf row in the recipient's name, priced by units", () => {
  const [row] = giftCartItems({ ...base, choice: { kind: "waqf", unit: "share", count: 2, unitPriceUSD: 100, title: "سهم وقفي" } });
  assert.equal(row.typeKey, "waqf"); assert.equal(row.amount, 200);
  assert.deepEqual(row.waqf, { unit: "share", count: 2, donorName: "أحمد", onBehalf: "سارة" });
  assert.ok(row.gift?.card);
});

test("waqf units: nearest whole number, at least one, within the waqf limit", () => {
  assert.equal(waqfUnitsFor(150, 100, 50), 2);
  assert.equal(waqfUnitsFor(40, 100, 50), 1);
  assert.equal(waqfUnitsFor(1_000_000, 100, 50), 50);
});

test("older cards keep their exact shape; new card choices are stored only when sent", () => {
  const old = parseGiftOrder({ recipientName: "x", channels: [], card: { occasion: "eid", theme: "dome", accent: 0, font: "naskh", signature: null, anonymous: false } });
  assert.ok(old.ok);
  assert.deepEqual(old.ok && old.gift?.card, { occasion: "eid", theme: "dome", accent: 0, font: "naskh", signature: null, anonymous: false });
});

test("problems are reported in the order the donor fills the page", () => {
  assert.equal(giftDraftProblem({ ...base, choice: { kind: "project", slug: "x", title: "x", valueUSD: 0 } }, now)?.code, "amount");
  assert.equal(giftDraftProblem({ ...base, recipients: [{ name: "", phone: "", email: "" }] }, now)?.code, "name");
  assert.equal(giftDraftProblem({ ...base, whatsapp: false, email: false }, now)?.code, "channel");
  assert.deepEqual(giftDraftProblem({ ...base, recipients: [{ name: "علي", phone: "123", email: "a@b.co" }] }, now), { code: "phone", recipient: "علي" });
  assert.equal(giftDraftProblem({ ...base, sendAt: new Date(now.getTime() + 60_000) }, now)?.code, "date");
  assert.equal(giftDraftProblem(base, now), null);
  assert.deepEqual(themesFor("memory"), ["calm", "ivory", "arabesque"]);
});

test("scheduled gifts wait for their time, and a sweep sends them", () => {
  const delivery = fs.readFileSync("lib/donations/gift-delivery.ts", "utf8");
  const waqf = fs.readFileSync("lib/donations/waqf-gift-delivery.ts", "utf8");
  for (const src of [delivery, waqf]) assert.match(src, /giftSendAt: \{ lte: new Date\(\) \}/);
  assert.match(fs.readFileSync("lib/donations/resume-approved-gifts.ts", "utf8"), /export async function deliverDueScheduledGifts/);
});

test("the page is hidden until enabled, the recipient page needs the gift's token, every locale has its texts", () => {
  assert.match(fs.readFileSync("app/[locale]/gift/page.tsx", "utf8"), /if \(!settings\.enabled && !admin\) notFound\(\);/);
  assert.match(fs.readFileSync("app/[locale]/gift/open/[kind]/[id]/page.tsx", "utf8"), /timingSafeEqual/);
  const ar = JSON.parse(fs.readFileSync("i18n/messages/ar.json", "utf8")).giftPage;
  for (const file of fs.readdirSync("i18n/messages").filter(f => f.endsWith(".json"))) {
    const page = JSON.parse(fs.readFileSync(`i18n/messages/${file}`, "utf8")).giftPage;
    assert.deepEqual(Object.keys(page).sort(), Object.keys(ar).sort(), file);
  }
});
