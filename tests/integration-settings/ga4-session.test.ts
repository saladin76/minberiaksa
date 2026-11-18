import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as sanitize from "../../lib/attribution/sanitize";
import { ga4SessionIdForMeasurement, parseGa4SessionStreams } from "../../lib/tracking/ga4-session";

test("server picks only the session of the Measurement ID it sends to", () => {
  const attr = { ga_session_streams: "ABC123:1763000000,OLD999:1762000000" };
  assert.equal(ga4SessionIdForMeasurement(attr, "G-ABC123"), 1763000000);
  assert.equal(ga4SessionIdForMeasurement(attr, "g-old999"), 1762000000);
  assert.equal(ga4SessionIdForMeasurement(attr, "G-NOPE01"), undefined, "no match → no guess from another property");
  assert.equal(ga4SessionIdForMeasurement({ ...attr, ga_session_id: "1762000000" }, "G-NOPE01"), undefined, "streams present → legacy field ignored");
});

test("malformed or contradictory streams never produce a session", () => {
  assert.equal(ga4SessionIdForMeasurement({ ga_session_streams: "ABC123:17630" }, "G-ABC123"), undefined);
  assert.equal(ga4SessionIdForMeasurement({ ga_session_streams: "ABC123:1763000000;DROP TABLE" }, "G-ABC123"), undefined);
  assert.equal(ga4SessionIdForMeasurement({ ga_session_streams: "ABC123:1763000000,ABC123:1763000200" }, "G-ABC123"), undefined);
  assert.equal(parseGa4SessionStreams(42), undefined);
  assert.equal(ga4SessionIdForMeasurement(undefined, "G-ABC123"), undefined);
  assert.equal(ga4SessionIdForMeasurement({ ga_session_streams: "ABC123:1763000000" }, "GTM-XYZ"), undefined);
});

test("older donations keep working with a single well-formed session id only", () => {
  assert.equal(ga4SessionIdForMeasurement({ ga_session_id: "1763000000" }, "G-ABC123"), 1763000000);
  assert.equal(ga4SessionIdForMeasurement({ ga_session_id: "sess_1763000000_xx" }, "G-ABC123"), undefined);
});

test("the stream list survives attribution sanitizing", () => {
  const out = sanitize.sanitizeDonationAttribution({ ga_session_streams: "ABC123:1763000000,OLD999:1762000000", ga_client_id: "1.2" }) as Record<string, string>;
  assert.equal(out.ga_session_streams, "ABC123:1763000000,OLD999:1762000000");
});

function browser(cookies: Record<string, string>, nav?: Record<string, unknown>) {
  const jar = new Map(Object.entries(cookies)), storage = new Map<string, string>();
  const document = {
    referrer: "",
    get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); },
    set cookie(line: string) { const [pair] = line.split(";"); const i = pair.indexOf("="); const k = pair.slice(0, i), v = pair.slice(i + 1); if (/Max-Age=0/i.test(line)) jar.delete(k); else jar.set(k, v); },
  };
  const window = { location: { href: "https://minberiaksa.org/ar/checkout", search: "" } };
  const loaded = { exports: {} as { getDonationAttributionPayload: () => Record<string, string> } };
  const out = ts.transpileModule(fs.readFileSync("lib/attribution/client-payload.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(out).runInNewContext({ module: loaded, exports: loaded.exports, window, document, Date, Math, URLSearchParams, ...(nav ? { navigator: nav } : {}),
    sessionStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
    require: (name: string) => name === "./sanitize" ? sanitize : name === "@/lib/tracking/click-id-storage" ? { captureStoredClickIds: () => ({}), clearStoredClickIds: () => {} } : (() => { throw new Error("Unexpected import " + name); })() });
  return loaded.exports.getDonationAttributionPayload();
}

test("checkout captures every GA4 stream session, and a single stream also fills ga_session_id", () => {
  const many = browser({ _ga: "GA1.1.123456789.1763000000", _ga_ABC123: "GS2.1.s1763000000$o2$g1$t1763000040$j60$l0$h0", _ga_old999: "GS1.1.1762000000.4.1.1762000100.0.0.0" });
  assert.equal(many.ga_client_id, "123456789.1763000000");
  assert.equal(many.ga_session_streams, "ABC123:1763000000,OLD999:1762000000");
  assert.equal(many.ga_session_id, undefined, "several streams: the server decides, not the browser");
  const one = browser({ _ga_ABC123: "GS2.1.s1763000000$o2" });
  assert.equal(one.ga_session_streams, "ABC123:1763000000");
  assert.equal(one.ga_session_id, "1763000000");
});

test("no GA4 session is captured on denial, GPC, DNT, garbage or the app's own session cookie", () => {
  const good = { _ga_ABC123: "GS2.1.s1763000000$o2" };
  assert.equal(browser({ ...good, analytics_consent: "denied" }).ga_session_streams, undefined);
  assert.equal(browser(good, { globalPrivacyControl: true }).ga_session_streams, undefined);
  assert.equal(browser(good, { doNotTrack: "1" }).ga_session_streams, undefined);
  assert.equal(browser({ _ga_ABC123: "garbage", ala_attr_session_id: "sess_1763000000_x" }).ga_session_streams, undefined);
});
