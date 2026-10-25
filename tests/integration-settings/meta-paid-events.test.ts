import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import * as canonical from "../../lib/tracking/canonical";
import * as clientIp from "../../lib/tracking/client-ip";

// VM module interfaces and the Mongo fixture contain intentionally dynamic documents.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function load(file: string, deps: Row, globals: Row = {}) {
  const fixtureModule = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new vm.Script(source).runInNewContext({ module: fixtureModule, exports: fixtureModule.exports, Date, Math, Map, Set, Promise, URLSearchParams, console: { ...console, error() {} }, require: (name: string) => deps[name] ?? {}, fetch: () => { throw Error("Live network forbidden"); }, ...globals });
  return fixtureModule.exports as Row;
}
function matches(row: Row, query: Row): boolean {
  return Object.entries(query).every(([key, value]) => {
    if (key === "$or") return value.some((q: Row) => matches(row, q));
    if (value && typeof value === "object") {
      if ("$ne" in value) return row[key] !== value.$ne;
      if ("$exists" in value) return (row[key] !== undefined) === value.$exists;
      if ("$lte" in value) return row[key] <= value.$lte;
    }
    return row[key] === value;
  });
}
function fixture(overrides: Row = {}) {
  const row: Row = { id: "paid-fixture", status: "PAID", paidAt: new Date(), createdAt: new Date(), amount: 10, teamSupport: 2, fees: 1, totalAmount: 13, currency: "TRY", donor: { id: "donor", name: "Fixture Donor", email: "fixture@example.invalid" }, items: [], categoryItems: [], attribution: { client_ip: "2001:db8::1", user_agent: "Fixture" }, ...overrides };
  const ledger: Row[] = [], metaCalls: Row[] = [], gaCalls: Row[] = [];
  let fail = "", allowed = true;
  const prisma: Row = { donation: { findUnique: async () => row, update: async ({ data }: Row) => Object.assign(row, data) } };
  prisma.$runCommandRaw = async (cmd: Row) => {
    if (cmd.find) return { cursor: { firstBatch: ledger.filter(r => matches(r, cmd.filter)) } };
    const query = cmd.query ?? cmd.updates?.[0]?.q;
    const update = cmd.findAndModify ? cmd.update : cmd.updates?.[0]?.u;
    for (const key of Object.keys(update.$inc ?? {})) assert.ok(!(key in (update.$setOnInsert ?? {})), "Mongo rejects conflicting update operators on the same path");
    let found = ledger.find(r => matches(r, query));
    const identity = (r: Row) => r.platform === query.platform && r.eventId === query.eventId && r.channel === query.channel;
    if (!found) {
      if (ledger.some(identity)) throw Error("E11000 duplicate key");
      found = { platform: query.platform, eventId: query.eventId, channel: query.channel, ...update.$setOnInsert } as Row;
      ledger.push(found!);
    }
    assert.ok(found);
    Object.assign(found, update.$set);
    for (const key of Object.keys(update.$unset ?? {})) delete found[key];
    if (update.$inc) found.attempts = (found.attempts ?? 0) + update.$inc.attempts;
    return { value: found };
  };
  const deps: Row = {
    "@/lib/prisma": { prisma }, "@/lib/tracking/canonical": canonical,
    "@/lib/prisma-raw-command": { rawCommand: (v: unknown) => v, firstBatch: (reply: Row) => reply.cursor.firstBatch },
    "@/lib/tracking/conversion-event-indexes": { ensureConversionEventIndexes: async () => true },
    "@/lib/tracking/conversion-audit": { writeConversionAudit: async () => {}, pickAttributionForAudit: () => ({}), toTurkeyIso: () => null },
    "@/lib/tracking/tracking-settings": { getGa4ServerCredentialsFromSettings: async () => ({ measurementId: "fixture", apiSecret: "fixture" }) },
    "@/lib/tracking/meta-capi": { getMetaCapiCredentials: async () => allowed ? {} : null, sendMetaCapiEvent: async (event: Row) => { metaCalls.push(event); await Promise.resolve(); return { ok: event.event_name !== fail, ...(event.event_name === fail ? { error: "fixture failure" } : {}) }; } },
  };
  const log = load("lib/tracking/conversion-event-log.ts", deps);
  deps["@/lib/tracking/conversion-event-log"] = log;
  const server = load("lib/tracking/donation-conversion-server.ts", deps, { fetch: async (_url: string, init: RequestInit) => { gaCalls.push(JSON.parse(String(init.body))); return { ok: true, status: 204 }; } });
  return { row, ledger, metaCalls, gaCalls, server, log, deps, setFail: (name: string) => { fail = name; }, setAllowed: (value: boolean) => { allowed = value; } };
}

test("confirmed payment emits Donate and Purchase with independent IDs and one canonical total", async () => {
  const f = fixture();
  assert.equal((await f.server.sendDonationServerConversions(f.row.id)).ok, true);
  assert.deepEqual(f.metaCalls.map(c => c.event_name), ["Donate", "Purchase"]);
  assert.deepEqual(f.metaCalls.map(c => c.event_id), [canonical.metaDonationEventId(f.row.id, "success"), canonical.metaPurchaseEventId(f.row.id)]);
  for (const event of f.metaCalls) {
    assert.equal(event.custom_data.value, 13); assert.equal(event.custom_data.currency, "TRY");
    assert.equal(event.event_time, Math.floor(f.row.paidAt.getTime() / 1000));
    assert.equal(event.user_data.client_ip, "2001:db8::1");
  }
  assert.equal(f.metaCalls[1].custom_data.content_type, "product");
  assert.equal(f.gaCalls.length, 1);
  assert.equal(f.gaCalls[0].events[0].params.transaction_id, f.row.id);
  assert.equal(f.ledger.length, 3);
  assert.ok(f.row.conversionEventsSentAt);
});
for (const failed of ["Donate", "Purchase"]) test(`retry only ${failed} after partial failure; GA4 is not duplicated`, async () => {
  const f = fixture(); f.setFail(failed);
  assert.equal((await f.server.sendDonationServerConversions(f.row.id)).ok, false);
  assert.equal(f.row.conversionEventsSentAt, undefined);
  f.setFail("");
  assert.equal((await f.server.sendDonationServerConversions(f.row.id, { force: true })).ok, true);
  assert.deepEqual(f.metaCalls.map(c => c.event_name), ["Donate", "Purchase", failed]);
  assert.equal(f.gaCalls.length, 1);
  await f.server.sendDonationServerConversions(f.row.id, { force: true });
  assert.equal(f.metaCalls.length, 3); assert.equal(f.gaCalls.length, 1);
  assert.ok(f.ledger.every(r => r.status === "SENT" && !r.error));
});
test("concurrent callbacks lease each event and retain the same identities", async () => {
  const f = fixture();
  await Promise.all([f.server.sendDonationServerConversions(f.row.id), f.server.sendDonationServerConversions(f.row.id)]);
  assert.equal(f.metaCalls.filter(e => e.event_name === "Donate").length, 1);
  assert.equal(f.metaCalls.filter(e => e.event_name === "Purchase").length, 1);
  assert.equal(f.gaCalls.length, 1);
  await f.server.sendDonationServerConversions(f.row.id);
  assert.ok(f.row.conversionEventsSentAt);
});
for (const state of [{ status: "PENDING" }, { paidAt: null }, { totalAmount: 0, amount: 0, teamSupport: 0, fees: 0 }]) test(`unsettled or zero payment emits neither success event ${JSON.stringify(state)}`, async () => {
  const f = fixture(state); await f.server.sendDonationServerConversions(f.row.id);
  assert.equal(f.metaCalls.length, 0); assert.equal(f.gaCalls.length, 0);
});
test("legacy sent marker is not a Purchase backfill even with a forced generic retry", async () => {
  const f = fixture({ conversionEventsSentAt: new Date() });
  const result = await f.server.sendDonationServerConversions(f.row.id, { force: true });
  assert.equal(result.skipped, true); assert.equal(f.metaCalls.length, 0); assert.equal(f.gaCalls.length, 0);
});
test("missing credentials remain retryable without stamping the donation", async () => {
  const f = fixture(); f.setAllowed(false); await f.server.sendDonationServerConversions(f.row.id);
  assert.equal(f.row.conversionEventsSentAt, undefined);
  assert.equal(f.ledger.filter(e => e.platform === "META" && e.status === "SKIPPED").length, 2);
  f.setAllowed(true); await f.server.sendDonationServerConversions(f.row.id);
  assert.equal(f.metaCalls.length, 2); assert.equal(f.gaCalls.length, 1);
});
for (const frequency of ["DAILY", "FRIDAY", "MONTHLY"]) test(`server-only ${frequency} renewal uses its own paid donation ID and actual frequency`, async () => {
  const f = fixture({ id: "renewal-fixture", subscriptionId: "plan", subscription: { frequency }, billingReason: "subscription_cycle" });
  await f.server.sendDonationServerConversions(f.row.id);
  assert.deepEqual(f.metaCalls.map(e => e.event_id), ["donate_renewal-fixture", "purchase_renewal-fixture"]);
  assert.ok(f.metaCalls.every(e => e.custom_data.recurring && e.custom_data.donation_type === frequency && e.custom_data.content_category === frequency.toLowerCase()));
});
function storage() { const rows = new Map<string, string>(); return { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => rows.set(k, v), removeItem: (k: string) => rows.delete(k) }; }
async function browserFixture(preexistingDonate = false, blocked = false, strict = false) {
  const calls: unknown[][] = [], logs: Row[] = [], localStorage = storage(), sessionStorage = storage();
  if (preexistingDonate) localStorage.setItem("marketing_final_browser:donate_browser", "1");
  const payload = { ok: true, transactionId: "browser", eventId: "donate_browser", value: 13, currency: "TRY", metaEvents: [{ eventName: "Donate", eventId: "donate_browser" }, { eventName: "Purchase", eventId: "purchase_browser" }] };
  let effect: () => () => void = () => () => {}, ref: Row = { current: null };
  const deps = { react: { useRef: () => ref, useEffect: (fn: typeof effect) => { effect = fn; } }, "next/navigation": { usePathname: () => "/ar/success/browser" }, "@/lib/tracking/browser-conversions": { fireGoogleAdsDonationConversion: async () => {}, fireTikTokDonationConversion: async () => {}, fireXDonationConversion: async () => {} } };
  const component = load("components/SuccessFinalConversionTracker.tsx", deps, { window: { fbq: blocked ? undefined : (...args: unknown[]) => calls.push(args), localStorage, sessionStorage, location: { search: "?t=guest-token" } }, setTimeout: (fn: () => void) => { fn(); }, fetch: async (url: string, init?: RequestInit) => { if (url.includes("track-browser-conversion")) { assert.ok(url.endsWith("?t=guest-token")); logs.push(JSON.parse(String(init?.body))); } return { json: async () => url.includes("/tracking?") ? payload : {} }; } });
  component.SuccessFinalConversionTracker();
  if (strict) { const cleanup = effect(); cleanup(); }
  effect();
  for (let i = 0; i < 400; i++) await Promise.resolve();
  ref = { current: null }; component.SuccessFinalConversionTracker(); effect();
  for (let i = 0; i < 400; i++) await Promise.resolve();
  return { calls, logs, localStorage };
}
test("browser sends both with server IDs once across a success-page reload", async () => {
  const f = await browserFixture();
  assert.deepEqual(f.calls.map(c => c[1]), ["Donate", "Purchase"]);
  assert.deepEqual(f.calls.map(c => (c[3] as Row).eventID), ["donate_browser", "purchase_browser"]);
  assert.ok(f.calls.every(c => (c[2] as Row).value === 13 && (c[2] as Row).currency === "TRY"));
  assert.deepEqual(f.logs.map(l => l.eventName), ["Donate", "Purchase"]);
});
test("an existing Donate browser guard does not suppress the new Purchase", async () => {
  const f = await browserFixture(true); assert.deepEqual(f.calls.map(c => c[1]), ["Purchase"]);
});
test("blocked browser does not claim that either event was sent", async () => {
  const f = await browserFixture(false, true); assert.equal(f.calls.length, 0);
  assert.ok(f.logs.every(l => l.status === "SKIPPED"));
  assert.equal(f.localStorage.getItem("marketing_final_browser:purchase_browser"), null);
});
test("React StrictMode cleanup and replay still send each event exactly once", async () => {
  const f = await browserFixture(false, false, true); assert.deepEqual(f.calls.map(c => c[1]), ["Donate", "Purchase"]);
});
test("genuine IPv6 and IPv4 survive normalization, malformed values are omitted", () => {
  assert.equal(clientIp.normalizeTrackingClientIp("2001:db8::1234, 127.0.0.1"), "2001:db8::1234");
  assert.equal(clientIp.normalizeTrackingClientIp("[2001:db8::1234]:443"), "2001:db8::1234");
  assert.equal(clientIp.normalizeTrackingClientIp("198.51.100.23:443"), "198.51.100.23");
  for (const bad of ["garbage2001:db8::1", "999.999.999.999", "unknown", "", "fe80::1%eth0"]) assert.equal(clientIp.normalizeTrackingClientIp(bad), undefined);
});

const nextResponse = { NextResponse: { json: (data: unknown, options?: { status?: number; headers?: Row }) => ({ data, status: options?.status ?? 200, headers: options?.headers }) } };
function routeFixture(overrides: Row = {}) {
  const f = fixture(overrides);
  f.deps["next/server"] = nextResponse;
  f.deps["@/lib/certificates/http"] = { donationAccess: async (_id: string, token: string) => ({ allowed: token === "guest-token" }) };
  f.deps["@/lib/donations/access-token"] = { DONATION_TOKEN_PARAM: "t" };
  f.deps["@/lib/tracking/meta-capi"].buildMetaUserData = () => ({});
  return { ...f, tracking: load("app/api/donations/[id]/tracking/route.ts", f.deps), browserLog: load("app/api/donations/[id]/track-browser-conversion/route.ts", f.deps) };
}
const routeRequest = (body?: unknown, token = "guest-token") => ({ nextUrl: new URL(`https://fixture.invalid/?t=${token}`), headers: new Headers(), json: async () => body });
test("authorized success payload shares both CAPI IDs; old receipts have no browser conversions", async () => {
  const f = routeFixture();
  const reply = await f.tracking.GET(routeRequest(), { params: Promise.resolve({ id: f.row.id }) });
  assert.equal(reply.status, 200);
  assert.deepEqual(Array.from(reply.data.metaEvents, (event: Row) => event.eventId), ["donate_paid-fixture", "purchase_paid-fixture"]);
  assert.equal(reply.headers["Cache-Control"], "private, no-store");
  f.row.paidAt = new Date(Date.now() - 49 * 60 * 60 * 1000);
  assert.equal((await f.tracking.GET(routeRequest(), { params: Promise.resolve({ id: f.row.id }) })).data.metaEvents.length, 0);
  assert.equal((await f.tracking.GET(routeRequest(undefined, "wrong"), { params: Promise.resolve({ id: f.row.id }) })).status, 403);
});
test("legacy Donate marker does not advertise a new browser Purchase", async () => {
  const f = routeFixture({ conversionEventsSentAt: new Date() });
  const result = await f.tracking.GET(routeRequest(), { params: Promise.resolve({ id: f.row.id }) });
  assert.deepEqual(Array.from(result.data.metaEvents, (e: Row) => e.eventName), ["Donate"]);
});
test("browser acknowledgement authenticates, validates event identity and normalizes value/currency", async () => {
  const f = routeFixture();
  const post = (body: Row, token = "guest-token") => f.browserLog.POST(routeRequest(body, token), { params: Promise.resolve({ id: f.row.id }) });
  const body = { platform: "META", eventName: "Purchase", eventId: "purchase_paid-fixture", status: "SENT", value: 999, currency: "USD" };
  assert.equal((await post(body, "wrong")).status, 403);
  assert.equal((await post({ ...body, eventId: "donate_paid-fixture" })).status, 400);
  assert.equal((await post({ ...body, eventName: "FakeEvent" })).status, 400);
  assert.equal((await post(body)).status, 200);
  const event = f.ledger.find(e => e.channel === "browser")!;
  assert.equal(event.eventName, "Purchase"); assert.equal(event.value, 13); assert.equal(event.currency, "TRY");
  f.row.paidAt = null; await post(body);
  assert.equal(f.ledger.find(e => e.channel === "browser")!.status, "SKIPPED");
});
test("Cloudflare IPv6 is trusted only under the explicit origin-header configuration", () => {
  const before = process.env.TRACKING_TRUST_CLOUDFLARE;
  const headers = new Headers({ "cf-connecting-ipv6": "2001:db8::23", "cf-connecting-ip": "198.51.100.23", "x-forwarded-for": "203.0.113.9" });
  try {
    delete process.env.TRACKING_TRUST_CLOUDFLARE;
    assert.equal(clientIp.getTrackingClientIp(headers), "203.0.113.9");
    process.env.TRACKING_TRUST_CLOUDFLARE = "true";
    assert.equal(clientIp.getTrackingClientIp(headers), "2001:db8::23");
  } finally { if (before === undefined) delete process.env.TRACKING_TRUST_CLOUDFLARE; else process.env.TRACKING_TRUST_CLOUDFLARE = before; }
});
test("CAPI Purchase requires value/currency and actual acceptance, and omits invented identifiers", async () => {
  let requests = 0, accept = false;
  const capi = load("lib/tracking/meta-capi.ts", { crypto, "@/lib/tracking/client-ip": clientIp }, { fetch: async (_url: string, init: RequestInit) => {
    requests++;
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.data[0].user_data.client_ip_address, "2001:db8::23");
    assert.equal(payload.data[0].user_data.ct, undefined);
    return { ok: true, status: 200, json: async () => ({ events_received: accept ? 1 : 0 }) };
  } });
  const event = { event_name: "Purchase", event_id: "purchase_fixture", user_data: { client_ip: "2001:db8::23" }, custom_data: { value: 13, currency: "TRY" } };
  const creds = { pixelId: "fixture", accessToken: "fixture" };
  assert.equal((await capi.sendMetaCapiEvent({ ...event, custom_data: { value: 0, currency: "TRY" } }, creds)).skipped, true);
  assert.equal((await capi.sendMetaCapiEvent({ ...event, custom_data: { value: 13 } }, creds)).skipped, true);
  assert.equal(requests, 0);
  assert.equal((await capi.sendMetaCapiEvent(event, creds)).ok, false);
  accept = true;
  assert.equal((await capi.sendMetaCapiEvent(event, creds)).ok, true);
});

test("the legacy public CAPI mirror refuses payment conversions before any platform call", async () => {
  const route = load("app/api/tracking/facebook-capi/route.ts", { "next/server": nextResponse, "@/lib/tracking/client-ip": clientIp });
  for (const event_name of ["Donate", "Purchase", "DonateFailed"]) {
    const result = await route.POST(routeRequest({ event_name }));
    assert.equal(result.status, 409);
  }
});
