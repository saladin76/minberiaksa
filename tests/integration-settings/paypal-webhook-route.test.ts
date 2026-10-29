import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";

function fixture(options: { signature?: boolean; configured?: boolean; providerFailure?: boolean } = {}) {
  let verified = 0, reads = 0, settled = 0;
  const ids: string[] = [];
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (value: unknown, init: ResponseInit = {}) => Response.json(value, init) } },
    "@/lib/prisma": { prisma: { globalSettings: { findFirst: async () => { reads++; return { paypalWebhookId: options.configured === false ? null : "webhook-fixture" }; } } } },
    "@/lib/paypal": { verifyPayPalWebhook: async () => { verified++; return options.signature !== false; } },
    "@/lib/donations/paypal-donation": { reconcilePayPalWebhookOrder: async (id: string) => { settled++; ids.push(id); if (options.providerFailure) throw new Error("Provider unavailable"); return "paid"; } },
  };
  const mod = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  const code = ts.transpileModule(readFileSync("app/api/webhooks/paypal/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ module: mod, exports: mod.exports, process: { env: {} }, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } });
  return { run: (body: unknown) => mod.exports.POST(new Request("https://minberiaksa.org/api/webhooks/paypal", { method: "POST", body: JSON.stringify(body) })), stats: () => ({ verified, reads, settled }), ids };
}
test("PayPal webhook rejects an invalid signature before accessing or settling any donation", async () => {
  const f = fixture({ signature: false }); const response = await f.run({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "FAKECAPTURE" } });
  assert.equal(response.status, 401); assert.equal(f.stats().settled, 0);
});
test("verified PayPal capture events resolve the related order through provider truth, never the capture id", async () => {
  for (const event_type of ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.DENIED"]) {
    const f = fixture(); assert.equal((await f.run({ event_type, resource: { id: "CAPTUREONLY", supplementary_data: { related_ids: { order_id: "ORDER1234567" } } } })).status, 200);
    assert.deepEqual(f.ids, ["ORDER1234567"]);
  }
});
test("verified approval uses its order id and malformed/irrelevant events never touch donations", async () => {
  const f = fixture(); await f.run({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "ORDER1234567" } });
  await f.run({ event_type: "UNKNOWN", resource: { id: "ORDER1234567" } });
  await f.run({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAPTUREONLY" } });
  assert.deepEqual(f.ids, ["ORDER1234567"]);
});
test("missing webhook registration and failed provider reads remain retryable failures", async () => {
  const missing = fixture({ configured: false }); assert.equal((await missing.run({ event_type: "CHECKOUT.ORDER.APPROVED" })).status, 503); assert.equal(missing.stats().verified, 0);
  assert.equal((await fixture().run(null)).status, 400);
  const failed = fixture({ providerFailure: true }); assert.equal((await failed.run({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "ORDER1234567" } })).status, 502);
});
