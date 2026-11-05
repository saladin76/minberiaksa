import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as handoff from "../../lib/minbar/payment-handoff";
const id = "a".repeat(24);

test("successful bank handoff tolerates a www alias, preserves the current session host and token", () => {
  const target = handoff.paymentResultTarget(`https://www.minberiaksa.org/api/albaraka/2d/result?donationId=${id}&t=secret`, "https://minberiaksa.org");
  assert.equal(target, `https://minberiaksa.org/api/albaraka/2d/result?donationId=${id}&t=secret`);
  assert.equal(handoff.paymentResultTarget("https://minberiaksa.org/ar/success/123", "https://www.minberiaksa.org"), "https://www.minberiaksa.org/ar/success/123");
});

test("result navigation rejects other sites, schemes, credentials and arbitrary local endpoints", () => {
  for (const target of ["https://evil.invalid/api/albaraka/2d/result", "https://minberiaksa.org.evil.invalid/api/albaraka/2d/result", "https://user:password@minberiaksa.org/api/albaraka/2d/result", "http://minberiaksa.org/api/albaraka/2d/result", "javascript:alert(1)", "/api/albaraka/3d/initiate", "/ar/cart"]) {
    assert.throws(() => handoff.paymentResultTarget(target, "https://minberiaksa.org"));
  }
});

test("a cart storage exception after capture cannot turn a successful payment into a checkout error", () => {
  const navigated: string[] = [];
  const result = handoff.albarakaResultPath(id, "ar", "guest token");
  handoff.navigatePaymentResult(result, () => { throw new Error("Storage unavailable"); }, url => navigated.push(url));
  assert.deepEqual(navigated, [result]);
  assert.match(result, /t=guest\+token/);
  assert.throws(() => handoff.albarakaResultPath("invalid", "ar"));
});

test("lost or failed initiation replies check the existing order; validation failures remain editable", () => {
  for (const status of [undefined, 0, 500, 502, 504]) assert.equal(handoff.needsPaymentResultCheck(status), true);
  assert.equal(handoff.needsPaymentResultCheck(409, "PAYMENT_ALREADY_PROCESSING"), true);
  for (const status of [400, 401, 403, 409, 429]) assert.equal(handoff.needsPaymentResultCheck(status, "INVALID_CARD_CVC"), false);
});

function load(path: string, deps: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as Record<string, (...args: unknown[]) => unknown> };
  runInNewContext(js, { module, exports: module.exports, URL, URLSearchParams, console, ...globals,
    require: (key: string) => { if (key in deps) return deps[key]; throw new Error(`Unexpected dependency ${key}`); } });
  return module.exports;
}

for (const [paidAt, status, expected] of [[new Date(), "PAID", "paid"], [null, "PAID", "processing"], [null, "FAILED", "failed"]] as const) {
  test(`authorized payment status reads ${expected} without initiating, reconciling or notifying`, async () => {
    const result = load("app/api/albaraka/2d/result/route.ts", {
      "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } },
      "next-auth": { getServerSession: async () => { throw new Error("Token access must not wait for a session"); } },
      "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
      "@/lib/payment-public-origin": { paymentPublicOrigin: () => "https://minberiaksa.org" },
      "@/lib/donations/access-token": { donationTokenMatches: (a: string, b: string) => a === b, withDonationToken: () => { throw new Error("No redirect during status read"); } },
      "@/lib/prisma": { prisma: { donation: { findUnique: async () => ({ paidAt, status, accessToken: "secret", donorId: "owner" }) } } },
    });
    const response = await result.GET(new Request(`https://minberiaksa.org/api/albaraka/2d/result?donationId=${id}&t=secret&view=status`)) as Response;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { state: expected });
  });
}

for (const session of [null, { user: { id: "other" } }, { user: { id: "owner" } }]) {
  test(`status polling requires a verified token or the owning session (${session?.user.id ?? "guest"})`, async () => {
    const result = load("app/api/albaraka/2d/result/route.ts", {
      "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } },
      "next-auth": { getServerSession: async () => session }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
      "@/lib/payment-public-origin": { paymentPublicOrigin: () => "https://minberiaksa.org" },
      "@/lib/donations/access-token": { donationTokenMatches: () => false },
      "@/lib/prisma": { prisma: { donation: { findUnique: async () => ({ paidAt: new Date(), status: "PAID", accessToken: "secret", donorId: "owner" }) } } },
    });
    const response = await result.GET(new Request(`https://minberiaksa.org/api/albaraka/2d/result?donationId=${id}&view=status`)) as Response;
    assert.equal(response.status, session?.user.id === "owner" ? 200 : 403);
  });
}

test("while initiation is still waiting, read-only polling moves to the recorded payment result and tolerates cart errors", async () => {
  const timers = new Map<number, { run: () => void; delay: number }>();
  let sequence = 0, reads = 0;
  let cleanup: (() => void) | undefined;
  const navigated: string[] = [];
  const component = load("components/minbar/checkout/PaymentResultWatcher.tsx", {
    react: { useEffect: (effect: () => () => void) => { cleanup = effect(); } },
    "@/lib/minbar/payment-handoff": handoff,
    "@/lib/minbar/cart": { clearCart: () => { throw new Error("Storage failed after capture"); } },
  }, {
    AbortController,
    setTimeout: (run: () => void, delay: number) => { const key = ++sequence; timers.set(key, { run, delay }); return key; },
    clearTimeout: (key: number) => timers.delete(key),
    window: { location: { replace: (url: string) => navigated.push(url) } },
    fetch: async (url: string, options: { method?: string; cache: string }) => {
      assert.match(url, /\/api\/albaraka\/2d\/result\?/);
      assert.match(url, /view=status/);
      assert.equal(options.method, undefined);
      assert.equal(options.cache, "no-store");
      reads++;
      return new Response(JSON.stringify({ state: reads === 1 ? "processing" : "paid" }));
    },
  });
  component.default({ donationId: id, token: "secret", locale: "ar" });
  await new Promise(setImmediate);
  assert.equal(navigated.length, 0);
  const next = [...timers].find(([, timer]) => timer.delay === 2500)!;
  assert.ok(next);
  timers.delete(next[0]); next[1].run();
  await new Promise(setImmediate);
  assert.deepEqual(navigated, [handoff.albarakaResultPath(id, "ar", "secret")]);
  assert.equal(reads, 2);
  cleanup?.();
  assert.equal(timers.size, 0);
});

test("the actual browser driver recovers an HTTP 500 after capture using the same order and no second POST", async () => {
  let posts = 0;
  const navigated: string[] = [];
  const driver = load("lib/minbar/checkout.ts", {
    "./payment-handoff": handoff, "../donations/guest-access-client": {}, "@/lib/minbar/donation-amount": {},
    "@/lib/donations/recurring-schedule": {}, "@/lib/ai/concierge/client": {}, "@/lib/attribution/client-payload": {},
  }, {
    AbortSignal,
    window: { location: { origin: "https://minberiaksa.org", assign: (url: string) => navigated.push(url) } },
    fetch: async (endpoint: string, options: { method: string; body: string; signal: AbortSignal }) => {
      assert.equal(endpoint, "/api/albaraka/3d/initiate");
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).donationId, id);
      assert.ok(options.signal instanceof AbortSignal);
      posts++;
      return new Response(JSON.stringify({ error: "Failed to initiate payment" }), { status: 500 });
    },
  });
  try {
    await driver.initiateBankPayment(id, "ar", "ALBARAKA", undefined, "2D");
    assert.fail("Expected a lost success response");
  } catch (error) {
    const failure = error as { status: number; code?: string };
    assert.equal(handoff.needsPaymentResultCheck(failure.status, failure.code), true);
    const result = handoff.albarakaResultPath(id, "ar", "secret");
    handoff.navigatePaymentResult(result, () => {}, url => navigated.push(url));
  }
  assert.equal(posts, 1);
  assert.deepEqual(navigated, [handoff.albarakaResultPath(id, "ar", "secret")]);
  driver.submitGatewayForm({ method: "GET", actionUrl: `https://www.minberiaksa.org/api/albaraka/2d/result?donationId=${id}&t=secret`, fields: {} });
  assert.equal(navigated[1], `https://minberiaksa.org/api/albaraka/2d/result?donationId=${id}&t=secret`);
  assert.equal(posts, 1);
});
