import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { clarityProjectId, clarityUserRecordingsUrl, normalizeClarityProjectId, resolveClarityConnection } from "../../lib/tracking/clarity-config";
import { isPublicAnalyticsPath } from "../../lib/tracking/private-path";
import {
  createPointerBurstDetector, donationStageView, isMeasurementHost, landingAttribution,
  measurementPath, measurementRouteKey, measurementUrl, referrerOrigin, sanitizeEngagementData,
} from "../../lib/tracking/engagement-policy";

test("measurement is limited to exact production hosts, independently of a preview project ID", () => {
  assert.equal(isMeasurementHost("minberiaksa.org", "production"), true);
  assert.equal(isMeasurementHost("www.minberiaksa.org", "production"), true);
  for (const host of ["toplamvakfii.vercel.app", "localhost", "minberiaksa.org.attacker.test", "preview.minberiaksa.org"]) {
    assert.equal(isMeasurementHost(host, "production"), false, host);
  }
  assert.equal(isMeasurementHost("minberiaksa.org", "development"), false);
  assert.equal(isMeasurementHost("minberiaksa.org", "test"), false);
  assert.equal(isMeasurementHost("analytics.example.org", "production", "analytics.example.org"), true);
  assert.equal(isMeasurementHost("preview.example.org", "production", "*.example.org"), false);
});

test("unexpanded ad macros are diagnosed without becoming Clarity campaign labels", () => {
  const query = new URLSearchParams("utm_source=facebook&utm_medium=paid_social&utm_campaign=campaign-42&device={{device_platform}}&platform={{publisher_platform}}");
  const result = landingAttribution(query);
  assert.equal(result.utm_campaign, "campaign-42");
  assert.equal(result.is_paid_traffic, 1);
  assert.equal(result.has_unresolved_macros, 1);
  for (const placeholder of ["{{campaign.name}}", "__CAMPAIGN_NAME__", "{campaignid}", "%7B%7Bcampaign.name%7D%7D"]) {
    const tags = landingAttribution(new URLSearchParams({ utm_campaign: placeholder, utm_source: "facebook" }));
    assert.equal(tags.utm_campaign, undefined);
    assert.equal(tags.has_unresolved_macros, 1);
    assert.equal(sanitizeEngagementData({ utm_campaign: placeholder }).utm_campaign, undefined);
  }
  assert.equal(sanitizeEngagementData({ has_unresolved_macros: 1 }).has_unresolved_macros, 1);
  assert.equal(query.get("device"), "{{device_platform}}", "diagnostics do not rewrite the donor URL");
});

test("Clarity recorder and dashboard use the same project, preserving configured overrides and filter encoding", () => {
  for (const configured of ["", "   ", "configured-project"]) {
    const project = clarityProjectId(configured);
    const url = new URL(clarityUserRecordingsUrl("user+id/&", configured));
    assert.equal(url.pathname, `/projects/view/${project}/impressions`);
    assert.equal(url.searchParams.get("CustomFilter"), "User-id=Is=user+id/&");
  }
  assert.equal(clarityProjectId(""), "u60r8zhrzh");
});

test("private document, pending and profile paths are redacted from custom measurement and excluded from content evidence", () => {
  const secret = "600000000000000000000002";
  for (const suffix of ["payment-pending", "payment-failed", "donation-failed", "receipt", "certificates/thanks", "profile", "account", "auth/complete-profile"]) {
    const path = `/en/${suffix}/${secret}`;
    assert.equal(isPublicAnalyticsPath(path), false, path);
    assert.doesNotMatch(measurementPath(path), new RegExp(secret));
    assert.doesNotMatch(JSON.stringify(sanitizeEngagementData({ path, href: `https://minberiaksa.org${path}?t=secret` })), /secret|600000/);
  }
  for (const route of ["checkout", "cart", "recurring-donation", "subscription", "subscriptions", "login", "register"]) {
    assert.equal(isPublicAnalyticsPath(`/ar/${route}`), false, route);
    assert.equal(isPublicAnalyticsPath(`/tr/${route}/synthetic-private-id`), false, route);
  }
  for (const locale of ["ar", "tr", "en", "fr"]) {
    for (const encoded of ["%2563heckout", "%252563heckout", "%2561ccount", "%2570rofile", "%2572eceipt", "%2563art"]) {
      assert.equal(isPublicAnalyticsPath(`/${locale}/${encoded}/synthetic-private`), false, `${locale}/${encoded}`);
    }
    // Malformed and over-encoded paths must never opt into the recorder.
    assert.equal(isPublicAnalyticsPath(`/${locale}/%2525252563heckout`), false);
  }
  assert.equal(isPublicAnalyticsPath("/en/%70rofile/secret"), false);
  assert.equal(isPublicAnalyticsPath("//untrusted.example/private"), false);
  assert.equal(isPublicAnalyticsPath("/en/bagislar/gaza-bread"), true);
  assert.equal(measurementPath("/en/blog/public-article"), "/en/blog/public-article");
});

test("credential cleanup never creates another diagnostic page while real page filters still do", () => {
  assert.equal(measurementRouteKey("/en/payment-pending", "donationId=id&t=secret&currency=USD&page=2"), "/en/payment-pending?page=2");
  assert.equal(measurementRouteKey("/en/bagislar", "AccessToken=private&page=2"), measurementRouteKey("/en/bagislar", "page=2"));
  assert.notEqual(measurementRouteKey("/en/bagislar", "page=2"), measurementRouteKey("/en/bagislar", "page=3"));
});

test("email, organic/social UTMs and fbclid alone do not prove paid traffic", () => {
  for (const query of [
    "utm_source=newsletter&utm_medium=email",
    "utm_source=google&utm_medium=organic",
    "utm_source=facebook&utm_medium=social",
    "utm_campaign=community", "fbclid=synthetic-click",
  ]) {
    const result = landingAttribution(new URLSearchParams(query));
    assert.equal(result.is_paid_traffic, 0, query);
    assert.equal(result.has_campaign_tags, 1);
    assert.equal(result.traffic_type, "tagged");
  }
  const direct = landingAttribution(new URLSearchParams());
  assert.equal(direct.traffic_type, "unattributed");
  assert.equal(direct.has_campaign_tags, 0);
});

test("explicit paid medium or an ad-specific click ID classifies paid traffic without exporting that ID", () => {
  for (const query of ["utm_medium=CPC", "utm_medium=paid_social", "gclid=synthetic-secret", "ttclid=synthetic-secret"]) {
    const result = landingAttribution(new URLSearchParams(query));
    assert.equal(result.is_paid_traffic, 1);
    assert.equal(result.traffic_type, "paid");
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret/);
  }
  assert.equal(landingAttribution(new URLSearchParams("utm_medium=email&gclid=stale-id")).is_paid_traffic, 0);
  assert.equal(landingAttribution(new URLSearchParams("fbclid=id")).has_fbclid, 1);
});

test("currency cleanup and query ordering do not create a new page; real filters and language changes do", () => {
  assert.equal(
    measurementRouteKey("/tr/zakat", "currency=USD&utm_source=test&page=2"),
    measurementRouteKey("/tr/zakat", "page=2&utm_source=test"),
  );
  assert.notEqual(measurementRouteKey("/tr/zakat", "page=2"), measurementRouteKey("/tr/zakat", "page=3"));
  assert.notEqual(measurementRouteKey("/ar/zakat", ""), measurementRouteKey("/en/zakat", ""));
});

test("measurement URLs remove access tokens, donor data, fragments and credentials without mutating inputs", () => {
  const raw = "https://user:password@minberiaksa.org/ar/success/synthetic-order?t=secret&email=donor%40example.org&currency=USD&utm_source=test#secret";
  assert.equal(measurementUrl(raw), "https://minberiaksa.org/ar/success?utm_source=test");
  assert.equal(raw.includes("synthetic-order"), true);
  assert.equal(measurementUrl("/tr/bagislar?page=2&sort=new&t=secret", "https://minberiaksa.org"), "https://minberiaksa.org/tr/bagislar?page=2&sort=new");
  assert.equal(measurementUrl("javascript:alert(1)"), undefined);
  assert.equal(measurementUrl("mailto:donor@example.org"), undefined);
  assert.equal(measurementUrl("not a url"), undefined);
  assert.equal(measurementPath("/en/reset-password/secret"), "/en/reset-password");
});

test("engagement payloads use an allowlist before all destinations", () => {
  const result = sanitizeEngagementData({
    path: "/ar/success/order?email=private@example.org",
    search: "currency=USD&t=private&utm_source=facebook",
    href: "https://payments.example.org/checkout?token=private",
    referrer: "https://search.example.org/private-path?q=private#private",
    email: "private@example.org", token: "private", fbclid: "private", event: "purchase",
    utm_campaign: "private@example.org", ms_since_navigation_start: 15, samples: Infinity,
  });
  assert.deepEqual(result, {
    measurement_version: "2", path: "/ar/success", search: "utm_source=facebook",
    href: "https://payments.example.org/checkout",
    referrer: "https://search.example.org", ms_since_navigation_start: 15,
  });
});

test("a pointer burst is isolated per route and emitted once per nearby burst", () => {
  const detect = createPointerBurstDetector();
  assert.equal(detect({ x: 10, y: 10, t: 0 }), undefined);
  assert.equal(detect({ x: 15, y: 10, t: 100 }), undefined);
  assert.equal(detect({ x: 10, y: 15, t: 200 }), 3);
  assert.equal(detect({ x: 10, y: 10, t: 300 }), undefined);
  assert.equal(detect({ x: 10, y: 10, t: 2000 }), undefined);
  assert.equal(createPointerBurstDetector()({ x: 10, y: 10, t: 200 }), undefined);
  const distant = createPointerBurstDetector();
  assert.equal(distant({ x: 0, y: 0, t: 0 }), undefined);
  assert.equal(distant({ x: 200, y: 0, t: 100 }), undefined);
  assert.equal(distant({ x: 400, y: 0, t: 200 }), undefined);
});

type Listener = (event: Record<string, unknown>) => void;
class FakeTarget {
  listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: Record<string, unknown> = {}) {
    for (const listener of [...this.listeners.get(type) ?? []]) listener(event);
  }
  listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
class FakeElement {
  tagName = "BUTTON";
  closest() { return null as FakeElement | null; }
}
class FakeAnchor extends FakeElement {
  tagName = "A";
  constructor(public href: string) { super(); }
  closest() { return this; }
}
type Effect = () => void | (() => void);
type Slot = { current?: unknown; deps?: unknown[]; setup?: Effect; cleanup?: void | (() => void) };

function hooks() {
  const slots: Slot[] = [];
  let cursor = 0;
  let pending: (() => void)[] = [];
  return {
    react: {
      useRef(value: unknown) { const slot = slots[cursor] ??= { current: value }; cursor++; return slot; },
      useLayoutEffect(setup: Effect, deps: unknown[]) {
        const slot = slots[cursor] ??= {};
        cursor++;
        if (slot.deps && deps.every((dep, i) => Object.is(dep, slot.deps![i]))) return;
        pending.push(() => { if (slot.cleanup) slot.cleanup(); slot.setup = setup; slot.cleanup = setup(); slot.deps = deps; });
      },
      useEffect(setup: Effect, deps: unknown[]) {
        const slot = slots[cursor] ??= {};
        cursor++;
        if (slot.deps && deps.every((dep, i) => Object.is(dep, slot.deps![i]))) return;
        pending.push(() => { if (slot.cleanup) slot.cleanup(); slot.setup = setup; slot.cleanup = setup(); slot.deps = deps; });
      },
    },
    render(component: () => unknown) { cursor = 0; component(); const jobs = pending; pending = []; jobs.forEach((run) => run()); },
    replayEffects() { slots.filter((slot) => slot.setup).forEach((slot) => { if (slot.cleanup) slot.cleanup(); slot.cleanup = slot.setup!(); }); },
    unmount() { slots.forEach((slot) => { if (slot.cleanup) slot.cleanup(); }); },
  };
}

/** Execute the actual client modules with fake browser/provider boundaries. No network or payment calls. */
function clientModule(path: string, imports: Record<string, unknown>, globals: Record<string, unknown>) {
  const output = ts.transpileModule(readFileSync(resolve(process.cwd(), path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  runInNewContext(output, {
    module: loaded, exports: loaded.exports,
    require: (name: string) => { assert.ok(name in imports, "Unexpected dependency: " + name); return imports[name]; },
    process: { env: { NODE_ENV: "production" } }, console, URL, URLSearchParams, ...globals,
  }, { filename: path });
  return loaded.exports;
}

function browser(raw = "https://minberiaksa.org/ar/zakat?currency=USD&utm_medium=email") {
  const win = Object.assign(new FakeTarget(), { location: new URL(raw), dataLayer: [] as unknown[] });
  const doc = Object.assign(new FakeTarget(), { visibilityState: "visible", referrer: "https://search.example.org/?private=secret", title: "Test" });
  return {
    win, doc,
    globals: { window: win, document: doc, performance: { now: () => 100 }, Element: FakeElement, HTMLAnchorElement: FakeAnchor },
  };
}
const policy = {
  createPointerBurstDetector, donationStageView, landingAttribution, measurementPath, measurementRouteKey, measurementUrl, referrerOrigin,
  isMeasurementHost: (host: string) => isMeasurementHost(host, "production"),
  sanitizeEngagementData,
};

test("actual dispatcher sanitizes every destination and retains conversion-page GTM suppression", () => {
  const b = browser();
  const clarity: unknown[][] = [], ga: unknown[][] = [];
  Object.assign(b.win, { clarity: (...args: unknown[]) => clarity.push(args), gtag: (...args: unknown[]) => ga.push(args) });
  const api = clientModule("lib/analytics.ts", { "./tracking/engagement-policy": policy, "./tracking/private-path": { isPublicAnalyticsPath } }, b.globals);
  const send = api.trackEngagement as (name: string, data: Record<string, unknown>) => void;
  const data = { path: "/ar/zakat", href: "https://pay.example.org/?token=secret", email: "secret@example.org", event: "purchase" };
  send("first_click", data);
  assert.equal(ga.length, 1);
  assert.equal(b.win.dataLayer.length, 1);
  assert.doesNotMatch(JSON.stringify([clarity, ga, b.win.dataLayer]), /secret|purchase/);
  for (const path of ["/ar/success/order", "/en/donation-failed"]) {
    b.win.location = new URL("https://minberiaksa.org" + path);
    send("page_visible_again", data);
  }
  assert.equal(ga.length, 1, "private conversion pages never emit engagement diagnostics");
  assert.equal(b.win.dataLayer.length, 1);
  b.win.location = new URL("https://toplamvakfii.vercel.app/ar");
  send("first_click", data);
  assert.equal(ga.length, 1, "unapproved hosts and sensitive routes must not emit diagnostics");
  assert.equal(b.win.dataLayer.length, 1);
});

test("private donor routes block Clarity identity, custom events, GA4 and GTM diagnostic data", () => {
  const b = browser();
  const clarity: unknown[][] = [], google: unknown[][] = [];
  Object.assign(b.win, { clarity: (...args: unknown[]) => clarity.push(args), gtag: (...args: unknown[]) => google.push(args) });
  const api = clientModule("lib/analytics.ts", { "./tracking/engagement-policy": policy, "./tracking/private-path": { isPublicAnalyticsPath } }, b.globals);
  for (const locale of ["ar", "tr", "en", "fr"]) {
    for (const path of ["account/private", "cart", "checkout", "success/private-token", "profile", "recurring-donation"]) {
      b.win.location = new URL(`https://minberiaksa.org/${locale}/${path}`);
      (api.trackEngagement as (name: string, data: Record<string, unknown>) => void)("synthetic_test", { email: "private@example.invalid" });
      (api.clarityIdentify as (id: string) => void)("synthetic-private-user");
    }
  }
  assert.deepEqual(clarity, []);
  assert.deepEqual(google, []);
  assert.deepEqual(b.win.dataLayer, []);
});

test("legacy Clarity identify never forwards a donor identifier even on public pages", () => {
  const b = browser();
  const commands: unknown[][] = [];
  Object.assign(b.win, { clarity: (...args: unknown[]) => commands.push(args) });
  const api = clientModule("lib/analytics.ts", { "./tracking/engagement-policy": policy, "./tracking/private-path": { isPublicAnalyticsPath } }, b.globals);
  (api.clarityIdentify as (id: string) => void)("donor-email@example.invalid");
  assert.equal(commands.length, 0);
});

test("explicit consent withdrawal immediately blocks Clarity tags, identification and GTM diagnostics", () => {
  const b = browser();
  const clarity: unknown[][] = [], google: unknown[][] = [];
  Object.assign(b.win, { clarity: (...args: unknown[]) => clarity.push(args), gtag: (...args: unknown[]) => google.push(args) });
  const api = clientModule("lib/analytics.ts", { "./tracking/engagement-policy": policy, "./tracking/private-path": { isPublicAnalyticsPath } }, { ...b.globals, navigator: { doNotTrack: "0", globalPrivacyControl: false } });
  Object.assign(b.doc, { cookie: "analytics_consent=denied" });
  (api.trackEngagement as (name: string) => void)("fixture_event");
  (api.clarityIdentify as (id: string) => void)("private-identity");
  assert.equal(clarity.length, 0);
  assert.equal(google.length, 0);
  assert.equal(b.win.dataLayer.length, 0);
  Object.assign(b.doc, { cookie: "analytics_consent=granted" });
  (api.trackEngagement as (name: string) => void)("fixture_event");
  assert.equal(google.length, 1, "re-enabled diagnostics only with permission on a public route");
});

test("blocked or throwing analytics providers never break user interaction", () => {
  const b = browser();
  Object.assign(b.win, { clarity: () => { throw new Error("blocked"); }, gtag: () => { throw new Error("blocked"); } });
  const api = clientModule("lib/analytics.ts", { "./tracking/engagement-policy": policy, "./tracking/private-path": { isPublicAnalyticsPath } }, b.globals);
  assert.doesNotThrow(() => (api.trackEngagement as (name: string) => void)("first_click"));
});

test("resolved Clarity configuration keeps the legacy project until an operator saves or disables", () => {
  assert.deepEqual(resolveClarityConnection(null, ""), {
    clarityProjectId: "u60r8zhrzh", clarityEnabled: true, claritySource: "legacy",
  });
  assert.equal(resolveClarityConnection({ clarityProjectId: "  TESTPROJECT42 ", clarityEnabled: true }, "").clarityProjectId, "testproject42");
  assert.equal(resolveClarityConnection({ clarityEnabled: false }, "").clarityEnabled, false);
  for (const bad of ["<script>", "https://clarity.invalid", "", "a"]) {
    assert.equal(normalizeClarityProjectId(bad), null);
  }
});

async function mockClarityRuntime(options: {
  url?: string;
  routerPath?: string;
  enabled?: boolean;
  project?: string;
  optOut?: boolean;
  failure?: boolean;
  navigatePrivateThenPublic?: boolean;
  navigationPaths?: string[];
  changesAfterInit?: { enabled?: boolean; project?: string; failure?: boolean };
} = {}) {
  const b = browser(options.url ?? "https://minberiaksa.org/ar");
  const h = hooks(), ids: string[] = [], requests: string[] = [], clarityCommands: string[] = [];
  (b.win as unknown as { clarity: (...args: string[]) => void }).clarity = (...args: string[]) => clarityCommands.push(args[0]);
  let allow = options.enabled !== false;
  let configured = options.project ?? "dynamic1234";
  let failure = Boolean(options.failure);
  const client = clientModule("components/MicrosoftClarity.tsx", {
    react: h.react,
    "next/navigation": { usePathname: () => options.routerPath ?? b.win.location.pathname, useSearchParams: () => new URLSearchParams(b.win.location.search) },
    "@microsoft/clarity": { init: (id: string) => ids.push(id) },
    "@/lib/tracking/engagement-policy": policy,
    "@/lib/tracking/private-path": { isPublicAnalyticsPath },
    "@/lib/tracking/clarity-config": { normalizeClarityProjectId },
    "@/lib/tracking/marketing-gate": { whenMarketingAllowed: (cb: () => void) => { cb(); return () => {}; } },
  }, {
    ...b.globals,
    navigator: { doNotTrack: options.optOut ? "1" : "0", globalPrivacyControl: options.optOut },
    AbortController,
    fetch: async (url: string) => {
      requests.push(url);
      if (failure) return { ok: false };
      return { ok: true, json: async () => ({ clarityEnabled: allow, clarityProjectId: configured }) };
    },
  });
  h.render(client.default as () => unknown);
  // Flush two promise continuations: GET and JSON normalization.
  await new Promise<void>(resolve => setImmediate(resolve));
  h.replayEffects();
  await new Promise<void>(resolve => setImmediate(resolve));
  if (options.changesAfterInit) {
    if (options.changesAfterInit.enabled !== undefined) allow = options.changesAfterInit.enabled;
    if (options.changesAfterInit.project !== undefined) configured = options.changesAfterInit.project;
    if (options.changesAfterInit.failure !== undefined) failure = options.changesAfterInit.failure;
  }
  const navigationPaths = options.navigationPaths ?? (options.navigatePrivateThenPublic
    ? ["/ar/profile/private-record", "/ar/projects"] : []);
  const snapshots: { path: string; commands: string[]; initializations: number }[] = [];
  for (const path of navigationPaths) {
    b.win.location = new URL("https://minberiaksa.org" + path);
    h.render(client.default as () => unknown);
    // A valid public route deliberately waits for a fresh runtime read before resuming.
    await new Promise<void>(resolve => setImmediate(resolve));
    snapshots.push({ path, commands: [...clarityCommands], initializations: ids.length });
  }
  h.unmount();
  return { ids, requests, clarityCommands, snapshots };
}

test("actual Clarity loader fetches saved runtime config, initializes once and never duplicates on replay", async () => {
  const result = await mockClarityRuntime();
  assert.deepEqual(result.ids, ["dynamic1234"]);
  assert.ok(result.requests.every(url => url === "/api/tracking/config"));
  assert.ok(result.requests.length >= 1);
});

test("public analytics paths deny donor credentials and tokenized query keys", () => {
  for (const locale of ["ar", "tr", "en", "fr"]) {
    for (const query of ["donationId=donor-123", "access_token=secret", "t=guest-token", "paymentIntent=pi_test", "email=visitor%40example.invalid", "receipt_id=receipt-123", "code=oauth", "customerId=cus_test", "redirect=https%3A%2F%2Fprivate.example", "sig=secret-signature"]) {
      assert.equal(isPublicAnalyticsPath(`/${locale}/projects?${query}`), false, query);
    }
    assert.equal(isPublicAnalyticsPath(`/${locale}/projects?utm_source=google&utm_campaign=winter&page=2`), true);
    assert.equal(isPublicAnalyticsPath(`/${locale}/projects#token=synthetic-private`), false);
    assert.equal(isPublicAnalyticsPath(`/${locale}/projects#payment-details`), false);
  }
});

test("Clarity refuses a public route with a tokenized query and stops after query-only navigation", async () => {
  const first = await mockClarityRuntime({ url: "https://minberiaksa.org/ar/projects?donationId=fixture-donor" });
  assert.deepEqual(first.ids, [], "tokenized entry must never initialize Clarity");
  const second = await mockClarityRuntime({ navigationPaths: ["/ar/projects?access_token=fixture-secret", "/ar/projects?utm_source=google"] });
  assert.deepEqual(second.clarityCommands, ["stop", "start"], "query-only changes must stop and resume only after runtime verification");
});

test("Clarity stops on a private SPA route and resumes without a second init on a safe route", async () => {
  const result = await mockClarityRuntime({ navigatePrivateThenPublic: true });
  assert.deepEqual(result.ids, ["dynamic1234"]);
  assert.deepEqual(result.clarityCommands, ["stop", "start"]);
});

test("Clarity navigation cycles across all locales stop on private routes and resume only after verified runtime config", async () => {
  for (const locale of ["ar", "tr", "en", "fr"]) {
    const result = await mockClarityRuntime({ navigationPaths: [
      `/${locale}/checkout`, `/${locale}/profile/private`, `/${locale}/projects`,
      `/${locale}/bagislar/gaza`, `/${locale}/cart`, `/${locale}/zakat`,
    ] });
    assert.deepEqual(result.clarityCommands, ["stop", "start", "stop", "start"], locale);
    assert.equal(result.ids.length, 1, locale);
    assert.ok(result.snapshots.filter(x => /checkout|profile|cart/.test(x.path)).every(x => x.commands.at(-1) === "stop"), locale);
  }
});

test("Clarity refuses to restart after a saved disable, project switch or failed runtime refresh", async () => {
  for (const changesAfterInit of [{ enabled: false }, { project: "otherproject99" }, { failure: true }]) {
    const result = await mockClarityRuntime({ changesAfterInit, navigationPaths: ["/ar/checkout", "/ar/zakat", "/ar/projects"] });
    assert.deepEqual(result.clarityCommands, ["stop", "stop", "stop"], JSON.stringify(changesAfterInit));
    assert.equal(result.ids.length, 1);
  }
});

test("Clarity denies stale router and live-URL disagreement during a private transition", async () => {
  const staleRouter = await mockClarityRuntime({ url: "https://minberiaksa.org/ar/checkout", routerPath: "/ar/projects" });
  assert.deepEqual(staleRouter.ids, [], "live private URL vetoes the stale public router state");
  const staleBrowser = await mockClarityRuntime({ url: "https://minberiaksa.org/ar/projects", routerPath: "/ar/checkout" });
  assert.deepEqual(staleBrowser.ids, [], "private router state vetoes a still-public URL");
});

test("Clarity never loads on dashboard, donor private routes, preview or explicit privacy opt-out", async () => {
  for (const options of [
    { url: "https://minberiaksa.org/dashboard/platform-connections/tracking" },
    { url: "https://minberiaksa.org/tr/profile" },
    { url: "https://minberiaksa.org/ar/success/private-receipt" },
    { url: "https://toplamvakfii.vercel.app/ar" },
    { optOut: true },
    { enabled: false },
    { failure: true },
    { project: "<img src=x>" },
  ]) {
    const result = await mockClarityRuntime(options);
    assert.equal(result.ids.length, 0, JSON.stringify(options));
  }
});

test("actual route tracker ignores currency cleanup but tracks filters/navigation once with safe URLs", () => {
  const b = browser(), h = hooks(), views: unknown[][] = [];
  const tracking = { trackPageView: (...args: unknown[]) => views.push(args) };
  const loaded = clientModule("components/RoutePageViewTracker.tsx", {
    react: h.react,
    "next/navigation": { usePathname: () => b.win.location.pathname, useSearchParams: () => b.win.location.searchParams },
    "@/components/TrackingPixels": { useTracking: () => tracking },
    "@/lib/tracking/engagement-policy": policy,
  }, b.globals);
  const render = () => h.render(loaded.RoutePageViewTracker as () => unknown);
  render(); h.replayEffects();
  b.win.location.searchParams.delete("currency");
  render();
  assert.equal(views.length, 0);
  b.win.location = new URL("https://minberiaksa.org/tr/bagislar?page=2&token=synthetic-secret");
  render(); render();
  assert.equal(views.length, 1);
  assert.equal(views[0][0], "https://minberiaksa.org/tr/bagislar?page=2");
  b.win.location.searchParams.set("page", "3");
  render();
  assert.equal(views.length, 2);
  h.unmount();
});

test("actual engagement listeners survive replay, ignore cosmetic updates, clean up and emit diagnostics only", () => {
  const b = browser(), h = hooks(), events: { name: string; data: unknown }[] = [];
  const loaded = clientModule("components/EngagementInstrumentation.tsx", {
    react: h.react,
    "next/navigation": { usePathname: () => b.win.location.pathname, useSearchParams: () => b.win.location.searchParams },
    "@/lib/tracking/engagement-policy": policy,
    "@/lib/analytics": {
      isEngagementEnabled: () => isMeasurementHost(b.win.location.hostname, "production"),
      clarityTag: () => {},
      clarityEvent: () => {},
      trackEngagement: (name: string, data: Record<string, unknown>) => events.push({ name, data: sanitizeEngagementData(data) }),
    },
  }, b.globals);
  const render = () => h.render(loaded.default as () => unknown);
  render(); h.replayEffects();
  const count = (name: string) => events.filter((event) => event.name === name).length;
  assert.equal(count("landing_page_view"), 1);
  assert.equal(count("page_view_change"), 0);
  b.win.emit("scroll");
  b.win.location.searchParams.delete("currency"); render();
  b.win.emit("scroll");
  assert.equal(count("first_scroll"), 1);
  const target = new FakeElement();
  for (const timeStamp of [0, 100, 200, 300]) b.doc.emit("pointerdown", { target, timeStamp, clientX: 1, clientY: 1 });
  assert.equal(count("first_click"), 1);
  assert.equal(count("rapid_pointer_burst"), 1);
  assert.equal(count("rage_click"), 0);
  b.doc.visibilityState = "hidden"; b.doc.emit("visibilitychange");
  b.doc.visibilityState = "visible"; b.doc.emit("visibilitychange");
  b.doc.visibilityState = "hidden"; b.doc.emit("visibilitychange");
  assert.equal(count("page_became_hidden"), 1);
  assert.equal(count("page_visible_again"), 1);
  b.doc.emit("click", { target: new FakeAnchor("https://pay.example.org/checkout?token=secret") });
  assert.equal(count("outbound_link_click"), 1);
  assert.doesNotMatch(JSON.stringify(events), /secret/);
  b.win.location = new URL("https://minberiaksa.org/en/bagislar");
  render();
  assert.equal(count("page_view_change"), 1);
  b.win.emit("scroll");
  assert.equal(count("first_scroll"), 2);
  assert.ok(events.every((event) => !/purchase|donation_complete|payment_submit/.test(event.name)));
  h.unmount();
  assert.equal(b.win.listenerCount() + b.doc.listenerCount(), 0);
});

test("preview engagement mounts no listeners and emits nothing", () => {
  const b = browser("https://toplamvakfii.vercel.app/ar"), h = hooks();
  const loaded = clientModule("components/EngagementInstrumentation.tsx", {
    react: h.react,
    "next/navigation": { usePathname: () => b.win.location.pathname, useSearchParams: () => b.win.location.searchParams },
    "@/lib/tracking/engagement-policy": policy,
    "@/lib/analytics": {
      isEngagementEnabled: () => false,
      clarityTag: () => assert.fail("Preview tag emitted"),
      clarityEvent: () => assert.fail("Preview event emitted"),
      trackEngagement: () => assert.fail("Preview event emitted"),
    },
  }, b.globals);
  h.render(loaded.default as () => unknown);
  assert.equal(b.win.listenerCount() + b.doc.listenerCount(), 0);
  h.unmount();
});



test("donation stage diagnostics distinguish cart/checkout and never prove payment settlement", () => {
  for (const locale of ["ar", "tr", "en", "pt", "sq", "ja", "hi"]) {
    assert.equal(donationStageView(`/${locale}/cart`), "donation_cart_view");
    assert.equal(donationStageView(`/${locale}/checkout`), "donation_checkout_view");
    assert.equal(donationStageView(`/${locale}/success/private-id`), "donation_success_view");
    assert.equal(donationStageView(`/${locale}/payment-pending`), "donation_pending_view");
    assert.equal(donationStageView(`/${locale}/donation-failed`), "donation_failure_view");
  }
  for (const path of ["/ar/cart-settings", "/dashboard/checkout", "/tr/blog/checkout", "/xx/cart"]) assert.equal(donationStageView(path), undefined);
});

test("actual stage recorder ignores query cleanup/replay and records return visits without GA/GTM events", () => {
  const b = browser("https://minberiaksa.org/tr/cart?currency=TRY"), h = hooks();
  const stages: string[] = [], events: string[] = [];
  const loaded = clientModule("components/EngagementInstrumentation.tsx", {
    react: h.react,
    "next/navigation": { usePathname: () => b.win.location.pathname, useSearchParams: () => b.win.location.searchParams },
    "@/lib/tracking/engagement-policy": policy,
    "@/lib/analytics": { isEngagementEnabled: () => true, clarityTag: () => {}, clarityEvent: (name: string) => stages.push(name), trackEngagement: (name: string) => events.push(name) },
  }, b.globals);
  const render = () => h.render(loaded.default as () => unknown);
  render(); h.replayEffects();
  b.win.location.searchParams.delete("currency"); render();
  assert.deepEqual(stages, ["donation_cart_view"]);
  b.win.location = new URL("https://minberiaksa.org/tr/checkout"); render(); render();
  b.win.location = new URL("https://minberiaksa.org/tr/cart"); render();
  assert.deepEqual(stages, ["donation_cart_view", "donation_checkout_view", "donation_cart_view"]);
  assert.ok(events.every(name => !name.startsWith("donation_")));
  h.unmount();
});
