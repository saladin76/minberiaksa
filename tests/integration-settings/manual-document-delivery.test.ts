import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import ts from "typescript";
import { readGiftDeliveryState } from "../../lib/donations/gift-delivery-state";
import * as locales from "../../lib/locales";
import * as copy from "../../lib/certificates/manual-copy";
import { manualCertificateInput } from "../../lib/certificates/manual-input";

function load<T>(file: string, deps: Record<string, unknown>, env: Record<string, string> = {}) {
  const mod = { exports: {} as T };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new vm.Script(code).runInNewContext({ module: mod, exports: mod.exports, Date, Buffer, structuredClone, process: { env }, console: { error() {} }, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } });
  return mod.exports;
}
function deliveryFixture(options: { unknown?: boolean; beforeProviderFailure?: boolean; blocked?: boolean } = {}) {
  const row = { id: "111111111111111111111111", recipientName: "Recipient", recipientEmail: "recipient@example.test", recipientPhone: "+905551112233", serial: "MIA-MAN-2026-1", locale: "tr", createdById: "actor", document: { kind: "thanks", issuedDate: "29 Ekim 2026" }, deliveryState: {} as import("../../lib/donations/gift-delivery-state").GiftDeliveryState, deliveryLock: null as string | null, deliveryLockUntil: null as Date | null };
  let providers = 0, archives = 0, pdfs = 0;
  type Payload = { html?: string; attachments?: Array<{ contentType: string }>; templateName?: string; sender?: { id: string } };
  const sent: Payload[] = [];
  const prisma = { issuedCertificate: {
    updateMany: async ({ where, data }: { where: { OR?: unknown; deliveryLock?: string }; data: Record<string, unknown> }) => {
      if (where.OR && row.deliveryLockUntil && row.deliveryLockUntil > new Date()) return { count: 0 };
      if (where.deliveryLock && where.deliveryLock !== row.deliveryLock) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    }, findUnique: async () => structuredClone(row),
  } };
  const deps = {
    "server-only": {}, "node:crypto": crypto, "@prisma/client": {}, "../prisma": { prisma },
    "../events/dispatch": { resolveTriggerSendConfig: async () => ({}), resolveTriggerSender: () => options.blocked ? { ok: false, reason: "NO_DEFAULT_SENDER" } : { ok: true, sender: { id: "default", senderEmail: "sender@example.test" } } },
    "../communication/delivery-log-service": { createDeliveryRecord: async () => { archives++; return { ok: true, data: { id: "archive" } }; }, markDeliveryStatus: async () => {} },
    "../communication/provider-router": { sendPreparedDelivery: async (value: Payload) => { providers++; sent.push(value); return options.unknown ? { ok: false, reason: "ELASTIC_REQUEST_FAILED" } : { ok: true, providerMessageId: "email-message" }; } },
    "../donations/gift-whatsapp": { sendGiftWhatsapp: async (value: Payload) => { providers++; sent.push(value); return options.unknown ? { ok: false, uncertain: true, reason: "MEDIA_SEND_UNCONFIRMED" } : { ok: true, providerMessageId: "wa-message" }; } },
    "../donations/gift-delivery-state": { readGiftDeliveryState }, "../locales": locales,
    "../payment-public-origin": { paymentPublicOrigin: () => "https://minberiaksa.org" },
    "../templates/receipt-localization": { RECEIPT_BRANDS: { tr: "Minber-i Aksâ" } },
    "./manual-copy": copy, "../templates/email-assets": { INSTITUTION_EMAIL_LOGO_PATH: "/minbar/assets/logo-horizontal.png" },
    "./manual-render": { issuedDocumentToken: () => "scoped-token", manualDocumentTitle: () => "Bağış Belgesi", manualDocumentPdf: async () => { pdfs++; if (options.beforeProviderFailure) throw new Error("PDF_UNAVAILABLE"); return { filename: "document.pdf", pdf: Buffer.from("%PDF-fixture") }; } },
  };
  return { row, sent, run: load<{ deliverIssuedCertificate: (id: string, channel: "EMAIL" | "WHATSAPP") => Promise<{ ok: boolean; alreadySent?: boolean; reason?: string }> }>("lib/certificates/manual-delivery.ts", deps).deliverIssuedCertificate, stats: () => ({ providers, archives, pdfs }) };
}
test("manual document delivery accepts each channel once, archives email with PDF and uses the default sender", async () => {
  const f = deliveryFixture();
  assert.equal((await f.run(f.row.id, "EMAIL")).ok, true);
  assert.equal((await f.run(f.row.id, "EMAIL")).alreadySent, true);
  assert.equal((await f.run(f.row.id, "WHATSAPP")).ok, true);
  assert.equal((await f.run(f.row.id, "WHATSAPP")).alreadySent, true);
  assert.deepEqual(f.stats(), { providers: 2, archives: 1, pdfs: 2 });
  assert.equal(f.sent[0].attachments![0].contentType, "application/pdf");
  assert.ok(f.sent[0].html!.includes("Cairo") && f.sent[0].html!.includes("https://minberiaksa.org/minbar/assets/logo-horizontal.png"));
  assert.ok(!/[\u0600-\u06ff]/.test(f.sent[0].html!));
  assert.equal(f.sent[1].templateName, "mia_document_delivery_v1");
  assert.equal(f.sent[1].sender!.id, "default");
  assert.equal(f.row.deliveryLock, null);
});
test("a simultaneous click cannot send a manual certificate twice", async () => {
  const f = deliveryFixture();
  const results = await Promise.all([f.run(f.row.id, "EMAIL"), f.run(f.row.id, "EMAIL")]);
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(f.stats().providers, 1);
});
test("an uncertain provider response remains held for investigation on both channels", async () => {
  for (const channel of ["EMAIL", "WHATSAPP"] as const) {
    const f = deliveryFixture({ unknown: true });
    assert.equal((await f.run(f.row.id, channel)).ok, false);
    assert.equal(f.row.deliveryState[channel]!.status, "SENDING");
    assert.equal((await f.run(f.row.id, channel)).reason, "DELIVERY_OUTCOME_UNCERTAIN");
    assert.equal(f.stats().providers, 1);
  }
});
test("missing sender and PDF preparation failures never call the delivery provider", async () => {
  for (const option of [{ blocked: true }, { beforeProviderFailure: true }]) {
    const f = deliveryFixture(option); assert.equal((await f.run(f.row.id, "EMAIL")).ok, false); assert.equal(f.stats().providers, 0); assert.equal(f.stats().archives, 0);
  }
});
test("issued download tokens are scoped and preview signatures bind the exact input and document", () => {
  const mod = load<{ issuedDocumentToken: (id: string) => string; issuedDocumentTokenMatches: (id: string, token: string | null) => boolean; signManualPreview: (input: unknown, document: unknown) => { signature: string; document: unknown; expiresAt: number }; verifyManualPreview: (input: unknown, value: unknown) => boolean }>("lib/certificates/manual-render.ts", {
    "server-only": {}, "node:crypto": crypto, "../locales": locales,
    "../../i18n/locale-messages": {}, "./copy": {}, "./documents": {}, "./render": {}, "../templates/receipt-localization": {}, "./pdf": {}, "./manual-copy": copy,
  }, { NEXTAUTH_SECRET: "fixture-secret-only" });
  const first = "111111111111111111111111", second = "222222222222222222222222";
  assert.equal(mod.issuedDocumentTokenMatches(first, mod.issuedDocumentToken(first)), true);
  assert.equal(mod.issuedDocumentTokenMatches(second, mod.issuedDocumentToken(first)), false);
  assert.equal(mod.issuedDocumentTokenMatches(first, null), false);
  const input = manualCertificateInput.parse({ kind: "THANKS", locale: "tr", donorName: "Donor", issueDate: "2026-10-29" });
  const preview = mod.signManualPreview(input, { kind: "thanks", copy: { body: "Approved wording" } });
  assert.equal(mod.verifyManualPreview(input, preview), true);
  assert.equal(mod.verifyManualPreview({ ...input, donorName: "Another" }, preview), false);
  assert.equal(mod.verifyManualPreview(input, { ...preview, document: { kind: "receipt" } }), false);
  assert.equal(mod.verifyManualPreview(input, { ...preview, expiresAt: Date.now() - 1 }), false);
  assert.equal(mod.verifyManualPreview(input, { ...preview, signature: null }), false);
});
