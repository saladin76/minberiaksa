import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  createPointerBurstDetector, isMeasurementHost, landingAttribution,
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
  createPointerBurstDetector, landingAttribution, measurementPath, measurementRouteKey, measurementUrl, referrerOrigin,
  isMeasurementHost: (host: string) => isMeasurementHost(host, "production"),
  sanitizeEngagementData,
};

test("actual dispatcher sanitizes every destination and retains conversion-page GTM suppression", () => {
  const b = browser();
  const clarity: unknown[][] = [], ga: unknown[][] = [];
  Object.assign(b.win, { clarity: (...args: unknown[]) => clarity.push(args), gtag: (...args: unknown[]) => ga.push(args) });
  const api = clientModule("lib/analytics.ts", { "./tracking/engagement-policy": policy }, b.globals);
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
  assert.equal(ga.length, 3);
  assert.equal(b.win.dataLayer.length, 1);
  b.win.location = new URL("https://toplamvakfii.vercel.app/ar");
  send("first_click", data);
  assert.equal(ga.length, 3);
  assert.equal(b.win.dataLayer.length, 1);
});

test("blocked or throwing analytics providers never break user interaction", () => {
  const b = browser();
  Object.assign(b.win, { clarity: () => { throw new Error("blocked"); }, gtag: () => { throw new Error("blocked"); } });
  const api = clientModule("lib/analytics.ts", { "./tracking/engagement-policy": policy }, b.globals);
  assert.doesNotThrow(() => (api.trackEngagement as (name: string) => void)("first_click"));
});

test("actual Clarity loader initializes once and excludes preview/development hosts", () => {
  for (const [host, expected] of [["minberiaksa.org", 1], ["toplamvakfii.vercel.app", 0]] as const) {
    const b = browser("https://" + host + "/ar");
    const h = hooks(), ids: string[] = [];
    const loaded = clientModule("components/MicrosoftClarity.tsx", {
      react: h.react, "@microsoft/clarity": { init: (id: string) => ids.push(id) },
      "@/lib/tracking/engagement-policy": policy,
    }, { ...b.globals, process: { env: { NODE_ENV: "production", NEXT_PUBLIC_CLARITY_ID: "configured-test-project" } } });
    h.render(loaded.default as () => unknown);
    h.replayEffects();
    assert.equal(ids.length, expected);
    if (expected) assert.equal(ids[0], "configured-test-project");
    h.unmount();
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
      trackEngagement: () => assert.fail("Preview event emitted"),
    },
  }, b.globals);
  h.render(loaded.default as () => unknown);
  assert.equal(b.win.listenerCount() + b.doc.listenerCount(), 0);
  h.unmount();
});
