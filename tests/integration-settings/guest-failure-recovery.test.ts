import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { donationTokenMatches } from "../../lib/donations/access-token";
import { withDonationToken } from "../../lib/donations/access-token-link";
import {
  GUEST_DONATION_ACCESS_KEY, GUEST_DONATION_ACCESS_TTL_MS,
  rememberGuestDonationAccess, readGuestDonationAccess, donationDetailsUrl,
} from "../../lib/donations/guest-access-client";

const ID = "600000000000000000000001", OTHER = "600000000000000000000002";
const TOKEN = "a".repeat(48), CLONE_TOKEN = "b".repeat(48);
class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("a returned credential is tab-scoped, matched to one donation and expires", () => {
  const store = new MemoryStorage();
  assert.equal(rememberGuestDonationAccess(ID, TOKEN, store, 1000), true);
  assert.equal(readGuestDonationAccess(ID, store, 1001), TOKEN);
  assert.equal(readGuestDonationAccess(OTHER, store, 1001), null);
  assert.equal(readGuestDonationAccess(ID, store, 999), null);
  rememberGuestDonationAccess(ID, TOKEN, store, 1000);
  assert.equal(readGuestDonationAccess(ID, store, 1000 + GUEST_DONATION_ACCESS_TTL_MS), null);
  assert.equal(store.getItem(GUEST_DONATION_ACCESS_KEY), null);
});

test("storage denial, malformed records and invalid IDs are safe failures", () => {
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(rememberGuestDonationAccess(ID, TOKEN, blocked), false);
  assert.equal(readGuestDonationAccess(ID, blocked), null);
  const store = new MemoryStorage();
  for (const raw of ["invalid-json", "null", JSON.stringify({ donationId: ID, token: TOKEN, at: "bad" })]) {
    store.setItem(GUEST_DONATION_ACCESS_KEY, raw);
    assert.equal(readGuestDonationAccess(ID, store), null);
  }
  assert.equal(rememberGuestDonationAccess("../other", TOKEN, store), false);
  assert.equal(rememberGuestDonationAccess(ID, "short", store), false);
  assert.equal(donationDetailsUrl("../other", TOKEN), null);
  assert.equal(donationDetailsUrl(ID, TOKEN), "/api/donations/" + ID + "?t=" + TOKEN);
});

function loadClient(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  runInNewContext(code, {
    module: loaded, exports: loaded.exports, URL, URLSearchParams, AbortController, console,
    process: { env: { NODE_ENV: "test" } },
    require: (name: string) => { assert.ok(name in imports, "Unexpected dependency: " + name); return imports[name]; },
    ...globals,
  }, { filename: path });
  return loaded.exports;
}
function guestClient(store: MemoryStorage) {
  return loadClient("lib/donations/guest-access-client.ts", { "./access-token-link": { withDonationToken } }, { window: { sessionStorage: store } });
}

test("the actual order driver remembers only the returned credential without changing its request or result", async () => {
  for (const blocked of [false, true]) {
    const store = new MemoryStorage();
    if (blocked) store.setItem = () => { throw new Error("quota"); };
    const guest = guestClient(store), requests: { url: string; body: Record<string, unknown> }[] = [];
    const driver = loadClient("lib/minbar/checkout.ts", {
      "../donations/guest-access-client": guest,
      "@/lib/minbar/donation-amount": { lineLocal: () => null },
      "@/lib/donations/recurring-schedule": { orderTypeForItems: () => "ONE_TIME" },
      "@/lib/ai/concierge/client": { readConciergeAssisted: () => null, readConciergeTouched: () => null },
      "@/lib/attribution/client-payload": { getDonationAttributionPayload: () => ({}) },
    }, {
      fetch: async (url: string, options: { body: string }) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ donation: { id: ID, accessToken: TOKEN } }), { status: 200 });
      },
    });
    const result = await (driver.createDonation as (data: unknown) => Promise<unknown>)({
      items: [{ projectId: "project", amount: 25, currency: "USD", freqKey: "once" }],
      projects: [{ slug: "project", id: OTHER }],
      currency: "USD", locale: "tr", method: "CARD", teamSupport: 0,
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/cart/payment");
    assert.equal(requests[0].body.currency, "USD");
    assert.equal(JSON.stringify(requests[0].body.items), JSON.stringify([{ campaignId: OTHER, amount: 25 }]));
    assert.doesNotMatch(JSON.stringify(requests), new RegExp(TOKEN));
    assert.equal(JSON.stringify(result), JSON.stringify({ id: ID, accessToken: TOKEN, subscriptionId: null, bankTransferToken: null }));
    assert.equal(readGuestDonationAccess(ID, store), blocked ? null : TOKEN);
  }
});

async function runRetry(session: unknown, body: unknown, overrides: Record<string, unknown> = {}) {
  let writes = 0;
  const source = {
    id: ID, accessToken: TOKEN, donorId: "owner", paidAt: null, subscriptionId: null,
    amount: 25, amountUSD: 25, currency: "USD", totalAmount: 25, teamSupport: 0,
    items: [], categoryItems: [], paymentMethod: "PAYPAL", provider: "PAYPAL", ...overrides,
  };
  const handler = loadClient("app/api/donations/[id]/retry/route.ts", {
    "next/server": { NextResponse: { json: (data: unknown, options?: ResponseInit) => Response.json(data, options) } },
    "next-auth": { getServerSession: async () => session },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/prisma": { prisma: { donation: {
      findUnique: async () => source,
      create: async () => { writes++; return { id: OTHER, accessToken: CLONE_TOKEN }; },
    } } },
    "@/lib/donations/access-token": { mintDonationAccessToken: () => CLONE_TOKEN, donationTokenMatches },
    "@/lib/audit-log": {
      writeAuditLog: async () => {}, auditActorFromSiteSession: () => ({ actorRole: "USER" }),
      auditStreamForRole: () => "SITE",
    },
  });
  const req = new Request("https://minberiaksa.org/api/donations/" + ID + "/retry", { method: "POST", body: JSON.stringify(body) });
  const response = await (handler.POST as (request: Request, context: unknown) => Promise<Response>)(req, { params: Promise.resolve({ id: ID }) });
  return { writes, status: response.status, body: await response.json() };
}

test("anonymous retry without a matching credential cannot create a donation", async () => {
  for (const body of [{}, { t: "wrong" }, { t: "c".repeat(48) }, null]) {
    const result = await runRetry(null, body);
    assert.equal(result.status, 403);
    assert.equal(result.writes, 0);
    assert.doesNotMatch(JSON.stringify(result.body), new RegExp(TOKEN));
  }
});
test("a legitimate guest can prepare a retry and receives only the new credential", async () => {
  const result = await runRetry(null, { t: TOKEN });
  assert.equal(result.status, 200);
  assert.equal(result.writes, 1);
  assert.equal(result.body.accessToken, CLONE_TOKEN);
  assert.doesNotMatch(JSON.stringify(result.body), new RegExp(TOKEN));
});
test("settled and subscription donations still cannot be cloned", async () => {
  for (const extra of [{ paidAt: new Date().toISOString() }, { subscriptionId: "subscription" }]) {
    const result = await runRetry(null, { t: TOKEN }, extra);
    assert.equal(result.status, 400);
    assert.equal(result.writes, 0);
  }
});
test("existing owner/admin access remains, and a signed-in non-owner remains forbidden", async () => {
  for (const session of [{ user: { id: "owner", role: "USER" } }, { user: { id: "admin", role: "ADMIN" } }]) {
    const result = await runRetry(session, {});
    assert.equal(result.status, 200);
    assert.equal(result.writes, 1);
  }
  const denied = await runRetry({ user: { id: "other", role: "USER" } }, { t: TOKEN });
  assert.equal(denied.status, 403);
  assert.equal(denied.writes, 0);
});

type Node = { type?: unknown; props?: Record<string, unknown> };
async function failurePage(locale: string, details: Record<string, unknown>, rejects = false) {
  const store = new MemoryStorage();
  rememberGuestDonationAccess(ID, TOKEN, store);
  const guest = guestClient(store), states: unknown[] = [], effects: (() => unknown)[] = [];
  let cursor = 0, effectRegistered = false;
  const posts: unknown[] = [], gets: { url: string; options: { signal: AbortSignal; timeout: number } }[] = [];
  const assigned: string[] = [], replaced: string[] = [], logs: unknown[][] = [];
  const Button = () => null, dummy = () => null;
  const icons = new Proxy({}, { get: () => dummy });
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const page = loadClient("app/[locale]/donation-failed/page.tsx", {
    react: {
      useState: (value: unknown) => { const index = cursor++; if (!(index in states)) states[index] = value; return [states[index], (next: unknown) => { states[index] = next; }]; },
      useEffect: (effect: () => unknown) => { if (!effectRegistered) { effects.push(effect); effectRegistered = true; } },
      useMemo: (run: () => unknown) => run(),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    axios: {
      get: async (url: string, options: { signal: AbortSignal; timeout: number }) => {
        gets.push({ url, options });
        if (rejects) throw new Error("sensitive URL ?t=" + TOKEN);
        return { data: details };
      },
      post: async (...args: unknown[]) => { posts.push(args); return { data: {} }; },
    },
    "next/navigation": { useSearchParams: () => new URLSearchParams({ donationId: ID }) },
    "next-intl": { useLocale: () => locale, useTranslations: () => (key: string) => key },
    "@/i18n/routing": { Link: dummy, useRouter: () => ({ push: dummy }) },
    "react-hot-toast": { Toaster: dummy, toast: { success: dummy, error: dummy } },
    "lucide-react": icons, "@/components/ui/card": { Card: dummy },
    "@/components/ui/button": { Button }, "@/components/ui/badge": { Badge: dummy },
    "../bank-transfer/_components/BankAccountsBlock": dummy,
    "@/lib/minbar/cart": { restoreCheckoutAttempt: (id: string) => id === ID },
    "@/lib/minbar/routes": { miaPath: (route: string, lang: string) => "/" + lang + "/" + (route === "donationSuccess" ? "success" : route) },
    "@/lib/donations/guest-access-client": guest,
    "@/lib/donations/access-token-link": { withDonationToken },
    "@/lib/donations/payment-error-catalog": { resolvePaymentError: () => ({ key: "generic", severity: "soft" }) },
  }, {
    window: { location: { assign: (url: string) => assigned.push(url), replace: (url: string) => replaced.push(url) } },
    console: { error: (...args: unknown[]) => logs.push(args) },
  });
  const render = () => { cursor = 0; return (page.default as () => Node)(); };
  render();
  const cleanups = effects.map((run) => run());
  await new Promise<void>((done) => setImmediate(done));
  const tree = render();
  const buttons: Node[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const node = value as Node;
    if (node.type === Button && typeof node.props?.onClick === "function") buttons.push(node);
    Object.values(node.props ?? {}).forEach(walk);
  };
  walk(tree);
  return { posts, gets, assigned, replaced, logs, buttons, states, cleanups };
}

test("actual failure-page requests carry the matching guest credential in Arabic, English and Turkish", async () => {
  for (const locale of ["ar", "en", "tr"]) {
    const result = await failurePage(locale, { id: ID, amount: 25, totalAmount: 25, currency: "USD", paidAt: null, provider: "ALBARAKA" });
    assert.equal(result.gets[0].url, "/api/donations/" + ID + "?t=" + TOKEN);
    assert.equal(result.gets[0].options.timeout, 15_000);
    assert.equal(result.buttons.length, 1);
    await (result.buttons[0].props!.onClick as () => Promise<void>)();
    assert.deepEqual(result.assigned, ["/" + locale + "/checkout"]);
    assert.equal(result.posts.length, 0, "restoring the basket must not create or charge an order");
    for (const cleanup of result.cleanups) if (typeof cleanup === "function") cleanup();
    assert.equal(result.gets[0].options.signal.aborted, true);
  }
});
test("an already-settled donation goes to its receipt and never offers retry", async () => {
  const result = await failurePage("en", { id: ID, paidAt: "2026-10-25T00:00:00Z" });
  assert.deepEqual(result.replaced, ["/en/success/" + ID + "?t=" + TOKEN]);
  assert.equal(result.buttons.length, 0);
  assert.equal(result.posts.length, 0);
});
test("failed detail loading neither leaks credentials into logs nor creates a retry", async () => {
  const result = await failurePage("ar", {}, true);
  assert.doesNotMatch(JSON.stringify(result.logs), new RegExp(TOKEN));
  assert.equal(result.buttons.length, 0);
  assert.equal(result.posts.length, 0);
});
