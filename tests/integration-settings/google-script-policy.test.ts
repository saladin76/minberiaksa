import test from "node:test";
import assert from "node:assert/strict";
import { configuredGoogleTagManager, initializeGoogleTracking, loadConfiguredGoogleTagManager } from "../../lib/tracking/google-script-policy";

function browser() {
  const scope: Parameters<typeof initializeGoogleTracking>[1] = {};
  const scripts: Array<{ src: string; async?: boolean; onerror?: () => void; remove: () => void }> = [];
  const doc = {
    scripts,
    createElement: () => {
      const script = { src: "", remove: () => { const index = scripts.indexOf(script); if (index >= 0) scripts.splice(index, 1); } };
      return script;
    },
    head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) },
  } as unknown as Document;
  return { scope, doc, scripts };
}

test("missing, disabled, malformed and string-valued GTM settings never install a container", () => {
  const { scope, doc, scripts } = browser();
  for (const settings of [{}, { googleTagManagerEnabled: true }, { googleTagManagerEnabled: "true", googleTagManagerId: "GTM-123" }, { googleTagManagerEnabled: false, googleTagManagerId: "GTM-123" }, { googleTagManagerEnabled: true, googleTagManagerId: "GTM-123&inject=yes" }]) {
    assert.equal(configuredGoogleTagManager(settings), null);
    loadConfiguredGoogleTagManager(settings, scope, doc);
  }
  assert.equal(scripts.length, 0);
  assert.equal(scope.dataLayer, undefined);
});

test("GA4 and multiple Ads destinations share one script and configure once across remounts", () => {
  const { scope, doc, scripts } = browser();
  const input = { gaMeasurementId: "G-FIXTURE", adsIds: ["AW-123", "AW-456", "AW-123"] };
  initializeGoogleTracking(input, scope, doc);
  const firstGtag = scope.gtag;
  initializeGoogleTracking(input, scope, doc);
  initializeGoogleTracking({ ...input, adsIds: [...input.adsIds, "AW-789"] }, scope, doc);
  assert.equal(scope.gtag, firstGtag);
  assert.equal(scripts.length, 1);
  assert.ok(scripts[0].async);
  const commands = scope.dataLayer!.map(value => Array.from(value as ArrayLike<unknown>));
  assert.equal(commands.filter(value => value[0] === "js").length, 1);
  assert.deepEqual(commands.filter(value => value[0] === "config"), [
    ["config", "G-FIXTURE", { send_page_view: true }], ["config", "AW-123"], ["config", "AW-456"], ["config", "AW-789"],
  ]);
  scope.gtag?.("event", "purchase", { transaction_id: "fixture-donation", value: 1, currency: "USD" });
  assert.deepEqual(Array.from(scope.dataLayer!.at(-1) as ArrayLike<unknown>), ["event", "purchase", { transaction_id: "fixture-donation", value: 1, currency: "USD" }]);
});

test("existing Google queue/library is preserved; failed owned requests can retry", () => {
  const { scope, doc, scripts } = browser();
  const commands: unknown[][] = [];
  const existing = (...args: unknown[]) => { commands.push(args); };
  scope.gtag = existing;
  scripts.push({ src: "https://www.googletagmanager.com/gtag/js?id=AW-EXISTING&cx=c", remove: () => {} });
  initializeGoogleTracking({ gaMeasurementId: "G-FIXTURE", adsIds: [] }, scope, doc);
  assert.equal(scope.gtag, existing);
  assert.equal(scripts.length, 1);
  assert.deepEqual(commands, [["config", "G-FIXTURE", { send_page_view: true }]]);
  const clean = browser();
  initializeGoogleTracking({ adsIds: ["AW-123"] }, clean.scope, clean.doc);
  clean.scripts[0].onerror?.();
  assert.equal(clean.scripts.length, 0);
  initializeGoogleTracking({ adsIds: ["AW-123"] }, clean.scope, clean.doc);
  assert.equal(clean.scripts.length, 1);
});

test("only the explicitly enabled GTM container loads, once, alongside direct tracking", () => {
  const { scope, doc, scripts } = browser();
  const settings = { googleTagManagerEnabled: true, googleTagManagerId: " gtm-fixture " };
  initializeGoogleTracking({ adsIds: ["AW-123"] }, scope, doc);
  loadConfiguredGoogleTagManager(settings, scope, doc);
  loadConfiguredGoogleTagManager(settings, scope, doc);
  assert.equal(scripts.length, 2);
  assert.equal(scripts[1].src, "https://www.googletagmanager.com/gtm.js?id=GTM-FIXTURE");
  assert.equal(scope.dataLayer!.filter(value => (value as { event?: string }).event === "gtm.js").length, 1);
});
