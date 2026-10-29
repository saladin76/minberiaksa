import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { automaticEmailHtml } from "../../lib/templates/font";
import { maskedSavedCards } from "../../lib/donations/saved-card-display";
import { defaultTemplateStatus } from "../../lib/communication/default-template-status";
import { fetchDocument } from "../../lib/minbar/document-download";
import { pickNamespaces } from "../../i18n/locale-messages";
import { SUPPORTED_LOCALES } from "../../lib/locales";

test("saved cards merge full duplicate identities and retain different cards with the same suffix", () => {
  const row = { id: "default", cardNumber: "4242424242424242", cardType: "visa", expiryDate: "12/30", cardholderName: null, nickname: null, isDefault: true, createdAt: new Date() };
  const listed = maskedSavedCards([row, { ...row, id: "duplicate", isDefault: false }, { ...row, id: "suffix-collision", cardNumber: "4000000000004242", isDefault: false }], v => v);
  assert.deepEqual(listed.map(v => v.id), ["default", "suffix-collision"]);
  assert.equal(listed[0].last4, "4242");
  assert.doesNotMatch(JSON.stringify(listed), /4242424242424242|cardNumber/);
  assert.deepEqual(maskedSavedCards([row], () => { throw new Error("key unavailable"); }), []);
});
test("Meta approval belongs to the actual default account, regardless of other numbers", () => {
  const v = { businessAccountId: "default", languageCode: "ar", locale: "ar", approvalStatus: "APPROVED", category: "UTILITY", rejectionReason: null, qualityRating: null, lastSyncedAt: new Date() };
  const view = defaultTemplateStatus("default", [v, { ...v, businessAccountId: "other", approvalStatus: "REJECTED" }], [v]);
  assert.equal(view.overall.internalStatus, "APPROVED");
  assert.equal(view.labelAr, "معتمد في الحساب الافتراضي");
  assert.equal(view.variants.length, 1);
  assert.doesNotMatch(JSON.stringify(view), /businessAccountId|other/);
  assert.equal(defaultTemplateStatus("missing-default", [v], [v]).overall.internalStatus, "MISSING_IN_WABA");
  assert.equal(defaultTemplateStatus(null, [v], [v]).overall.internalStatus, "UNKNOWN");
});
test("automatic email uses Cairo for Arabic and a compact inline scale without changing contents or URLs", () => {
  const input = '<html lang="ar"><head></head><body style="font-family:Arial;font-size:32px;color:#123"><h1>Thank you</h1><p><strong style="font-size:28px">Total: 1.00 USD</strong></p><a href="https://example.test/document?t=private">Receipt</a><span style="font-size:11px">Footer</span></body></html>';
  const html = automaticEmailHtml(input, "ar");
  assert.match(html, /font-family:&quot;Cairo&quot;, Tahoma, Arial, sans-serif/);
  assert.doesNotMatch(html, /font-size:(28|32)px/);
  assert.match(html, /font-size:22px/); assert.match(html, /font-size:11px/);
  assert.ok(html.includes('href="https://example.test/document?t=private"') && html.includes("Total: 1.00 USD") && html.includes("color:#123"));
  assert.equal(automaticEmailHtml(html, "ar"), html);
});
test("checkout loads the saved-card language namespace in every supported language", () => {
  const source = readFileSync("app/[locale]/checkout/page.tsx", "utf8");
  const namespaces = JSON.parse(source.match(/const NAMESPACES = (\[.*?\]) as const/)![1]);
  for (const locale of SUPPORTED_LOCALES) {
    const ns = pickNamespaces(locale, namespaces).DonationDialog as Record<string, unknown>;
    assert.ok(typeof ns.savedCards === "string" && typeof ns.useNewCard === "string" && typeof ns.rememberCard === "string", locale);
  }
});
test("download rejects error/HTML responses and accepts only PDF bytes with a safe localized filename", async () => {
  const response = () => new Response("%PDF-1.4\nfixture", { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=fallback.pdf; filename*=UTF-8''%D8%A5%D9%8A%D8%B5%D8%A7%D9%84.pdf" } });
  const result = await fetchDocument("/api/receipts/id", "receipt.pdf", async (_url, options) => { assert.equal(options?.credentials, "same-origin"); return response(); });
  assert.equal(result.filename, "إيصال.pdf");
  for (const invalid of [new Response("error", { status: 503 }), new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } }), new Response("not a pdf", { headers: { "Content-Type": "application/pdf" } })]) {
    await assert.rejects(fetchDocument("/api/receipts/id", "receipt.pdf", async () => invalid));
  }
});
test("the legacy receipt URL reuses the authorized handler without a localhost redirect", async () => {
  let calls = 0;
  const mod = { exports: {} as { GET: (request: unknown, context: unknown) => Promise<Response> } };
  const source = ts.transpileModule(readFileSync("app/api/donations/[id]/receipt/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const request = { nextUrl: new URL("http://localhost:3000/api/donations/fixture/receipt?t=private"), headers: { cookie: "owner-session" } };
  new vm.Script(source).runInNewContext({ module: mod, exports: mod.exports, require: (name: string) => {
    assert.equal(name, "@/app/api/receipts/[donationId]/route");
    return { GET: async (req: unknown, ctx: { params: Promise<{ donationId: string }> }) => { assert.equal(req, request); assert.equal((await ctx.params).donationId, "fixture"); calls++; return Response.json({ authorizedHandler: true }); } };
  } });
  const result = await mod.exports.GET(request, { params: Promise.resolve({ id: "fixture" }) });
  assert.equal(calls, 1); assert.equal(result.status, 200); assert.equal(result.headers.get("Location"), null);
});
