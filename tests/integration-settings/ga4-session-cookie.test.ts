import test from "node:test";
import assert from "node:assert/strict";
import { currentGa4SessionIdFromCookies } from "../../lib/attribution/ga4-session-cookie";

test("recognizes real GS1 and GS2 cookie formats, never the application session", () => {
  assert.equal(currentGa4SessionIdFromCookies("_ga_ABC=GS1.1.1763000000.4.1.1763000100.0.0.0"), "1763000000");
  assert.equal(currentGa4SessionIdFromCookies("_ga_ABC=GS2.1.s1763000000$o3$g1$t1763000100$j60$l0$h0"), "1763000000");
  assert.equal(currentGa4SessionIdFromCookies("ala_attr_session_id=sess_1763000000_xxx"), undefined);
  assert.equal(currentGa4SessionIdFromCookies("_ga_ABC=garbage"), undefined);
});
test("rejects conflicting GA4 streams but accepts matching session streams", () => {
  assert.equal(currentGa4SessionIdFromCookies("_ga_ABC=GS2.1.s1763000000$o1; _ga_DEF=GS1.1.1763000000.2.1"), "1763000000");
  assert.equal(currentGa4SessionIdFromCookies("_ga_ABC=GS2.1.s1763000000$o1; _ga_DEF=GS2.1.s1763000010$o1"), undefined);
});
test("respects analytics rejection, GPC and DNT", () => {
  const good = "_ga_ABC=GS2.1.s1763000000$o1";
  assert.equal(currentGa4SessionIdFromCookies(good+"; analytics_consent=denied"), undefined);
  assert.equal(currentGa4SessionIdFromCookies(good+"; tracking_consent=false"), undefined);
  assert.equal(currentGa4SessionIdFromCookies(good, { doNotTrack: "1", globalPrivacyControl: false }), undefined);
  assert.equal(currentGa4SessionIdFromCookies(good, { doNotTrack: null, globalPrivacyControl: true }), undefined);
});
