import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { emailUnsubscribeCopy } from "../../lib/communication/unsubscribe-copy";
function load<T>(file: string, dependencies: Record<string, unknown>) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source, { filename: file }).runInNewContext({ module: loaded, exports: loaded.exports,
    require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; } });
  return loaded.exports as T;
}
test("marketing email footers use a complete, distinct local copy in all 19 languages", () => {
  const service = load<{ appendMarketingUnsubscribeFooter: (body: string, url: string, locale: string) => string }>("lib/communication/email-unsubscribe.ts", {
    "server-only": {}, crypto: {}, "@/lib/server-base-url": {}, "./unsubscribe-copy": { emailUnsubscribeCopy },
  });
  const labels = new Set<string>();
  for (const locale of SUPPORTED_LOCALES) {
    const copy = emailUnsubscribeCopy(locale); labels.add(copy.label);
    const html = service.appendMarketingUnsubscribeFooter("<html><body>Message</body></html>", "https://example.test/unsubscribe?a=1&b=2", locale);
    assert.ok(html.includes(copy.label)); assert.ok(html.includes("a=1&amp;b=2"));
    assert.ok(html.includes("font-family:inherit"));
    assert.equal(copy.dir, ["ar", "ur"].includes(locale) ? "rtl" : "ltr");
    for (const value of [copy.label, copy.question, copy.button, copy.done]) assert.ok(value.trim());
  }
  assert.equal(labels.size, 19);
});
test("unsubscribe GET is read-only and localized; form POST confirms in that language while API POST keeps JSON", async () => {
  let allowed = true, writes = 0;
  class Response {
    status: number; headers: Record<string, string>;
    constructor(public body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) { this.status = init.status ?? 200; this.headers = init.headers ?? {}; }
    static json(body: unknown, init: { status?: number } = {}) { return new Response(body, init); }
  }
  const route = load<{ GET: (request: unknown) => Promise<Response>; POST: (request: unknown) => Promise<Response> }>("app/api/communication/unsubscribe/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/communication/email-unsubscribe": { verifyEmailUnsubscribeToken: () => allowed },
    "@/lib/communication/email-suppression": { suppressEmailRecipient: async () => { writes++; } },
    "@/lib/communication/unsubscribe-copy": { emailUnsubscribeCopy },
  });
  const request = (locale: string, accept = "text/html") => ({ nextUrl: new URL(`https://example.test/api/communication/unsubscribe?email=fixture%40example.test&token=fixture-only&locale=${locale}`), headers: new Headers({ accept }) });
  for (const locale of SUPPORTED_LOCALES) {
    const result = await route.GET(request(locale));
    assert.equal(result.status, 200); assert.equal(writes, 0);
    assert.ok(String(result.body).includes(`lang="${locale}"`));
    assert.ok(String(result.body).includes(emailUnsubscribeCopy(locale).button));
  }
  allowed = false; assert.equal((await route.POST(request("fr"))).status, 400); assert.equal(writes, 0);
  allowed = true;
  const form = await route.POST(request("fr")); assert.ok(String(form.body).includes(emailUnsubscribeCopy("fr").done)); assert.equal(writes, 1);
  const api = await route.POST(request("fr", "application/json")); assert.equal((api.body as { unsubscribed: boolean }).unsubscribed, true); assert.equal(writes, 2);
});
