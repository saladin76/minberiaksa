import test from "node:test";
import assert from "node:assert/strict";
import { fixtureModule } from "./gift-delivery-fixture";
import * as tokens from "../../lib/donations/gift-certificate-token";
import * as giftDraft from "../../lib/donations/gift-template-draft";
import { RECEIPT_BRANDS } from "../../lib/templates/receipt-localization";
import { normalizeGiftPhone } from "../../lib/donations/gift-order";
import { messagesFor } from "../../i18n/locale-messages";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { buildStandardMetaComponents } from "../../lib/communication/meta-template-components";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";

function transport(options: { open?: boolean; approved?: boolean; blocked?: boolean; uncertain?: boolean } = {}) {
  const calls = { text: 0, template: 0, built: 0, mapping: [] as unknown[], statuses: [] as string[] };
  const service = fixtureModule<{ sendGiftWhatsapp: (input: unknown) => Promise<{ ok: boolean; reason?: string; uncertain?: boolean }> }>("lib/donations/gift-whatsapp.ts", {
    "server-only": {}, "@/lib/prisma": { prisma: { donorCommunicationProfile: { findMany: async () => options.blocked ? [{ doNotContact: true }] : [] }, whatsappTemplate: { findFirst: async () => options.approved ? { id: "template", name: "mia_gift_donation_v1" } : null } } },
    "./gift-template-draft": giftDraft,
    "./gift-order": { normalizeGiftPhone },
    "@/lib/communication/delivery-log-service": { createDeliveryRecord: async () => ({ ok: true, data: { id: "archive" } }), markDeliveryStatus: async (_id: string, status: string) => { calls.statuses.push(status); return { ok: true }; } },
    "@/lib/communication/conversation-service": { conversationId: () => "conversation" },
    "@/lib/communication/conversation-reply-service": { replyWindowFor: async () => ({ open: options.open === true }) },
    "@/lib/communication/phone": { phoneMatchVariants: (p: string) => [p] },
    "@/lib/communication/campaign-audience-accounting": { isWhatsappExplicitlyUnsubscribed: () => false },
    "@/lib/communication/automatic-message-dispatcher": { resolveMetaTemplateMapping: async (...args: unknown[]) => { calls.mapping.push(args); return { name: "mia_gift_donation_v1", language: "tr", componentsSchema: [] }; } },
    "@/lib/communication/providers/meta-whatsapp/parameters": { buildMetaComponents: () => { calls.built++; return { ok: true, components: [] }; } },
    "@/lib/communication/providers/meta-whatsapp/messages": {
      sendTextMessage: async () => { calls.text++; return { ok: true, providerMessageId: "text-accepted" }; },
      sendTemplateMessage: async () => { calls.template++; return options.uncertain ? { ok: false, reason: "META_WHATSAPP_REQUEST_FAILED" } : { ok: true, providerMessageId: "template-accepted" }; },
    },
  });
  const send = () => service.sendGiftWhatsapp({ phone: "+905550000001", name: "Recipient", locale: "tr", body: "Gift", itemId: "gift", values: {}, sender: { id: "default", phoneNumberId: "phone", businessAccountId: "waba-default" } });
  return { calls, send };
}

test("gift WhatsApp uses free text only inside the actual recipient/sender service window", async () => {
  const f = transport({ open: true }); assert.equal((await f.send()).ok, true);
  assert.equal(f.calls.text, 1); assert.equal(f.calls.template, 0); assert.deepEqual(f.calls.statuses, ["SENT"]);
});
test("a new recipient without an approved gift template is skipped before any provider request", async () => {
  const f = transport(); assert.equal((await f.send()).reason, "GIFT_TEMPLATE_APPROVAL_REQUIRED");
  assert.equal(f.calls.text + f.calls.template, 0); assert.deepEqual(f.calls.statuses, ["SKIPPED"]);
});
test("a gift template must be approved in the exact language on the default WABA", async () => {
  const f = transport({ approved: true }); assert.equal((await f.send()).ok, true);
  assert.equal(f.calls.template, 1); assert.equal(f.calls.text, 0); assert.equal(f.calls.built, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.mapping[0])), [{ id: "template", name: "mia_gift_donation_v1" }, "tr", "waba-default", { exactLanguage: true }]);
});
test("gift recipients with an explicit communication block are not contacted", async () => {
  const f = transport({ blocked: true, open: true }); assert.equal((await f.send()).reason, "RECIPIENT_UNSUBSCRIBED");
  assert.equal(f.calls.text + f.calls.template, 0);
});
test("lost Meta outcomes are distinguished from definite rejection", async () => {
  const f = transport({ approved: true, uncertain: true }); assert.equal((await f.send()).uncertain, true);
});

function certificate(options: { paid?: boolean; allowOwner?: boolean; itemId?: string; pdfFails?: boolean } = {}) {
  const itemId = options.itemId || "111111111111111111111111", donationId = "222222222222222222222222";
  const docs = { thanks: { donorName: "Donor" } };
  const calls = { pdf: 0, name: "", authorize: 0 };
  const route = fixtureModule<{ GET: (request: unknown, context: unknown) => Promise<Response> }>("app/api/gifts/[id]/certificate/route.ts", {
    "next/server": { NextResponse: class extends Response { static json(data: unknown, init: ResponseInit) { return new Response(JSON.stringify(data), init); } } },
    "@/lib/prisma": { prisma: { donationItem: { findUnique: async () => ({ id: itemId, donationId, giftRecipientName: "Recipient", donation: { id: donationId, paidAt: options.paid === false ? null : new Date(), accessToken: "donor-secret" } }) } } },
    "@/lib/donations/gift-certificate-token": tokens,
    "@/lib/certificates/http": { authorizeDonationAccess: async () => { calls.authorize++; return options.allowOwner ? null : new Response(null, { status: 403 }); }, pdfErrorResponse: () => new Response(null, { status: 503 }) },
    "@/lib/certificates/issue": { ensureDonationDocuments: async () => docs },
    "@/lib/certificates/generate": { generateThanksPdf: async (copy: typeof docs) => { calls.pdf++; if (options.pdfFails) throw new Error("renderer unavailable"); calls.name = copy.thanks.donorName; return { pdf: Buffer.from("%PDF-fixture"), filename: "gift.pdf" }; } },
    "@/lib/payment-public-origin": { paymentPublicOrigin: () => "https://minberiaksa.org" },
  });
  return { calls, docs, itemId, donationId, get: (token = "") => { const url = new URL("https://localhost:3000/api/gifts/" + itemId + "/certificate"); url.searchParams.set("giftToken", token); return route.GET({ url: url.href, nextUrl: url }, { params: Promise.resolve({ id: itemId }) }); } };
}

test("a valid item-scoped gift token downloads only the recipient certificate without renaming the donor", async () => {
  const f = certificate(); const response = await f.get(tokens.giftCertificateToken(f.itemId, f.donationId, "donor-secret")!);
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(f.calls.name, "Recipient"); assert.equal(f.docs.thanks.donorName, "Donor"); assert.equal(f.calls.authorize, 0);
});
test("missing or another item's gift token cannot access a certificate", async () => {
  for (const token of ["", tokens.giftCertificateToken("other-item", "222222222222222222222222", "donor-secret")!]) {
    const f = certificate(); assert.equal((await f.get(token)).status, 403); assert.equal(f.calls.pdf, 0);
  }
});
test("the owner may download a dedication without exposing the donation token to the recipient", async () => {
  const f = certificate({ allowOwner: true }); assert.equal((await f.get()).status, 200); assert.equal(f.calls.authorize, 1);
});
test("unconfirmed donations never issue gift certificates, even with a valid gift token", async () => {
  const f = certificate({ paid: false }); assert.equal((await f.get(tokens.giftCertificateToken(f.itemId, f.donationId, "donor-secret")!)).status, 404);
  assert.equal(f.calls.pdf, 0);
});
test("renderer failure returns a controlled certificate error without changing the donor name", async () => {
  const f = certificate({ allowOwner: true, pdfFails: true }); assert.equal((await f.get()).status, 503);
  assert.equal(f.docs.thanks.donorName, "Donor");
});

for (const locale of SUPPORTED_LOCALES) test(`${locale}: the gift draft contains the same six fields and fits Meta's body limit`, () => {
  const body = giftDraft.giftTemplateBody(messagesFor(locale).Gift, locale);
  assert.ok(body.length <= 1024);
  const fields = [...body.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1]).sort();
  assert.deepEqual(fields, ["gift.recipientName", "gift.donorName", "gift.project", "gift.amount", "gift.message", "gift.certificateUrl"].sort());
  assert.ok(body.endsWith(RECEIPT_BRANDS[locale]));
  const canonical = buildStandardMetaComponents({ body: giftDraft.giftTemplateBody(messagesFor("ar").Gift), header: { type: "NONE" }, headerText: "", footerText: "", buttons: [] });
  const variant = buildStandardMetaComponents({ body, header: { type: "NONE" }, headerText: "", footerText: "", buttons: [] });
  assert.equal(canonical.bindings.length, 6);
  const scopedNames = Object.fromEntries(canonical.bindings.map(binding => [`${binding.scope}.${binding.position}`, binding.key]));
  const values = { "gift.recipientName": "Recipient", "gift.donorName": "Donor", "gift.project": "Project", "gift.amount": "20 TRY", "gift.message": "For you", "gift.certificateUrl": "https://minberiaksa.org/api/gifts/fixture/certificate?giftToken=fixture" };
  const prepared = buildMetaComponents({ componentsSchema: variant.components, values, positionalNames: canonical.bindings.map(binding => binding.key), scopedNames });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
});
