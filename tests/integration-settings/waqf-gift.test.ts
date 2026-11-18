import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { giftFromLabel, waqfGiftPresentation } from "../../lib/certificates/gift-label";
import { giftCertificateToken } from "../../lib/donations/gift-certificate-token";
import { waqfGiftScope } from "../../lib/donations/waqf-gift-scope";

const read = (p: string) => fs.readFileSync(p, "utf8");

test("a gifted waqf names the recipient, credits the donor, and hides only the value when asked", () => {
  assert.deepEqual(waqfGiftPresentation({ donorName: "Ahmad" }), { name: "Ahmad", hideTotal: false });
  assert.deepEqual(waqfGiftPresentation({ donorName: "Ahmad", giftRecipientName: "  Mariam ", giftShowAmount: true }), { name: "Mariam", giftFrom: "Ahmad", hideTotal: false });
  assert.deepEqual(waqfGiftPresentation({ donorName: "Ahmad", giftRecipientName: "Mariam", giftShowAmount: false }), { name: "Mariam", giftFrom: "Ahmad", hideTotal: true });
  assert.equal(giftFromLabel("ar"), "مُهدى من"); assert.equal(giftFromLabel("tr"), "Hediye eden"); assert.equal(giftFromLabel("de"), "Gifted by");
});

test("the certificate face: value hidden only when asked, count always shown, 'Gifted by' line present", () => {
  const sheet = read("components/minbar/certificates/WaqfCertificateSheet.tsx");
  assert.match(sheet, /\{hideTotal \? null : <span[\s\S]*?\{copy\.valueLabel\}[\s\S]*?\{total\}<\/b>\s*<\/span>\}/);
  assert.match(sheet, /\{endowedLine\} \(<b>\{count\}<\/b>\)/, "the count stays");
  assert.match(sheet, /\{giftFromLabel\(locale\)\}:/);
  assert.match(read("lib/certificates/render.tsx"), /giftFrom=\{doc\.giftFrom\}\s*hideTotal=\{doc\.hideTotal\}/);
  assert.match(read("lib/certificates/issue.ts"), /donorName: waqfGiftPresentation\(item\)\.name,/);
  assert.equal((read("lib/certificates/documents.ts").match(/\.\.\.giftFields\(/g) ?? []).length, 2, "issued and preview documents");
});

test("the order writer stores a waqf gift exactly like a project gift, on every path, never on the plan", () => {
  const route = read("app/api/cart/payment/route.ts");
  assert.match(route, /const waqfGift = parseGiftOrder\(line\.gift\);\s*\n\s*if \(!waqfGift\.ok\) return NextResponse\.json\(\{ error: waqfGift\.error \}, \{ status: 400 \}\);/);
  assert.equal((route.match(/\.\.\.giftLineData\(line\.gift\)/g) ?? []).length, 3, "ordinary order and both mixed-frequency paths");
  assert.match(route, /waqfItems: waqfResolved\.map\(\(line\) => \(\{ \.\.\.line, gift: null \}\)\)/);
});

test("the basket and checkout carry the gift on waqf lines", () => {
  const checkout = read("lib/minbar/checkout.ts");
  assert.match(checkout, /onBehalf: item\.waqf\.onBehalf\.trim\(\),\s*\n\s*\.\.\.\(item\.gift \? \{ gift: orderGift\(item\.gift\) \} : \{\}\),/);
  assert.match(checkout, /\.\.\.\(item\.gift \? \{ gift: orderGift\(item\.gift\) \} : \{\}\),\n\s*\}\);\n\s*\}\n\s*else if \(item\.categoryId\)/, "project lines unchanged in behaviour");
  const page = read("components/minbar/waqf/WaqfPage.tsx");
  assert.match(page, /<GiftFields onChange=\{setGift\} showError=\{giftError\}/);
  assert.match(page, /\.\.\.\(gift\.ready && gift\.value \? \{ gift: gift\.value \} : \{\}\),/);
  assert.match(page, /if \(ok && gift\.configured && !gift\.ready\) \{ setGiftError\(true\); return false; \}/);
  assert.match(read("app/[locale]/msharya-alqds-alwqfy/page.tsx"), /"cart", "Gift"\] as const;/);
});

test("every text the gift form uses already exists in all languages", () => {
  const ui = read("components/minbar/gift/GiftFields.tsx");
  const cartKeys = [...new Set([...ui.matchAll(/tCart\("([A-Za-z]+)"/g)].map((m) => m[1]))];
  const giftKeys = [...new Set([...ui.matchAll(/tGift\("([A-Za-z]+)"/g)].map((m) => m[1]))];
  assert.ok(cartKeys.length >= 14);
  for (const file of fs.readdirSync("i18n/messages").filter((f) => f.endsWith(".json"))) {
    const m = JSON.parse(read(`i18n/messages/${file}`)) as { cart?: Record<string, string>; Gift?: Record<string, string> };
    for (const k of cartKeys) assert.ok(m.cart?.[k], `${file}: cart.${k}`);
    for (const k of giftKeys) assert.ok(m.Gift?.[k], `${file}: Gift.${k}`);
  }
});

test("delivery: waqf recipients are told even when the donation has no project gift; links are waqf-scoped", () => {
  const d = read("lib/donations/gift-delivery.ts");
  assert.match(d, /export async function deliverDonationGifts[\s\S]*?const result = await deliverProjectGifts\(donationId, options\);\s*\n\s*try \{\s*\n\s*const waqf = await \(await import\("\.\/waqf-gift-delivery"\)\)\.deliverWaqfGifts\(donationId, options\);/);
  const w = read("lib/donations/waqf-gift-delivery.ts");
  assert.match(w, /giftCertificateToken\(waqfGiftScope\(line\.id\), donationId, donation\.accessToken\)/);
  assert.match(w, /generateWaqfPdf\(cert, base\)/);
  assert.match(w, /if \(state\[channel\]\?\.status === "SENDING"\) \{ errors\.push\(channel \+ ":OUTCOME_UNCERTAIN"\)/, "an uncertain send is never repeated");
  const a = giftCertificateToken("6af674e2d1cd34cbb9de7d1a", "6af674e2d1cd34cbb9de7d1b", "secret");
  const b = giftCertificateToken(waqfGiftScope("6af674e2d1cd34cbb9de7d1a"), "6af674e2d1cd34cbb9de7d1b", "secret");
  assert.notEqual(a, b, "a project gift link never opens a waqf certificate, and vice versa");
  const route = read("app/api/gifts/waqf/[id]/certificate/route.ts");
  const exported = [...route.matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(exported, ["GET", "dynamic", "runtime"]);
});

test("the waqf line has the same gift columns as a project line", () => {
  const schema = read("prisma/schema.prisma");
  const block = (model: string) => schema.slice(schema.indexOf(`model ${model} {`), schema.indexOf("\n}", schema.indexOf(`model ${model} {`)));
  const cols = (b: string) => [...b.matchAll(/^\s+(gift\w+)\s/gm)].map((m) => m[1]).sort();
  assert.deepEqual(cols(block("DonationWaqfItem")), cols(block("DonationItem")));
  assert.ok(cols(block("DonationWaqfItem")).length >= 10);
});
