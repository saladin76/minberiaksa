import test from "node:test";
import assert from "node:assert/strict";
import { currentGa4SessionIdFromCookies } from "../../lib/attribution/ga4-session-cookie";

const gs1 = "_ga_ABC=GS1.1.1763000000.4.1.1763000100.0.0.0";
const gs2 = "_ga_ABC=GS2.1.s1763000000$o3$g1$t1763000100$j60$l0$h0";

test("only parses real GS1/GS2 cookies and never the application session", () => {
  assert.equal(currentGa4SessionIdFromCookies(gs1), "1763000000");
  assert.equal(currentGa4SessionIdFromCookies(gs2), "1763000000");
  assert.equal(currentGa4SessionIdFromCookies("ala_attr_session_id=sess_1763000000_xxx"), undefined);
  assert.equal(currentGa4SessionIdFromCookies("_ga_ABC=garbage"), undefined);
  assert.equal(currentGa4SessionIdFromCookies("_ga_ABC=GS2.1.snot-a-time$o1"), undefined);
});
test("without verified stream mapping, any multiple streams are ambiguous even if timestamps coincide", () => {
  const identical = "_ga_ABC=GS2.1.s1763000000$o1; _ga_DEF=GS1.1.1763000000.2.1";
  const different = "_ga_ABC=GS2.1.s1763000000$o1; _ga_DEF=GS2.1.s1763000010$o1";
  assert.equal(currentGa4SessionIdFromCookies(identical), undefined);
  assert.equal(currentGa4SessionIdFromCookies(different), undefined);
  assert.equal(currentGa4SessionIdFromCookies(identical, undefined, "ABC"), "1763000000");
  assert.equal(currentGa4SessionIdFromCookies(different, undefined, "DEF"), "1763000010");
  assert.equal(currentGa4SessionIdFromCookies(identical, undefined, "G-123"), undefined);
});
test("fails closed when the same stream appears with contradictory cookie values", () => {
  assert.equal(currentGa4SessionIdFromCookies("_ga_ABC=GS2.1.s1763000000$o1; _ga_ABC=GS2.1.s1763000200$o1"), undefined);
});
test("respects explicit denial, GPC and DNT", () => {
  assert.equal(currentGa4SessionIdFromCookies(gs2 + "; analytics_consent=denied"), undefined);
  assert.equal(currentGa4SessionIdFromCookies(gs2 + "; tracking_consent=false"), undefined);
  assert.equal(currentGa4SessionIdFromCookies(gs2, { doNotTrack: "1", globalPrivacyControl: false }), undefined);
  assert.equal(currentGa4SessionIdFromCookies(gs2, { doNotTrack: null, globalPrivacyControl: true }), undefined);
});
