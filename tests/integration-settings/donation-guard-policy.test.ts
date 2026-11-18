import test from "node:test";
import assert from "node:assert/strict";
import { decideGuard, normalizeGuardSettings, strictest, normEmail, normPhone, normDevice, DEFAULT_GUARD_SETTINGS } from "../../lib/site-security/donation-guard-policy";
import { issueTrustMark, verifyTrustMark } from "../../lib/site-security/donation-trust";

const s = normalizeGuardSettings({});
const T0 = Date.UTC(2026, 10, 15, 12, 0, 0), MIN = 60_000, HOUR = 3600_000;
const d = (state: Parameters<typeof decideGuard>[0]["state"], unpaidInWindow: number, unpaidSinceProbation = 0, now = T0, known = false) =>
  decideGuard({ state, unpaidInWindow, unpaidSinceProbation, now, known, settings: s });

test("owner rule: 6 unpaid (failed or pending) → 5-minute freeze; 5 is still allowed", () => {
  assert.equal(d(null, 5).action, "ALLOW");
  const f = d(null, 6);
  assert.equal(f.action, "COOLDOWN"); assert.equal(f.transition, "FROZE");
  assert.equal(f.next?.cooldownUntil, T0 + 5 * MIN);
});

test("during the freeze every attempt waits; after it, 6 more unpaid → blocked until a person releases it", () => {
  const frozen = d(null, 6).next!;
  assert.equal(d(frozen, 99, 99, T0 + 4 * MIN).action, "COOLDOWN");
  const after = d(frozen, 0, 5, T0 + 6 * MIN);
  assert.equal(after.action, "ALLOW"); assert.equal(after.next?.phase, "PROBATION");
  const blocked = d(after.next, 0, 6, T0 + 10 * MIN);
  assert.equal(blocked.action, "BLOCK"); assert.equal(blocked.transition, "BLOCKED");
  assert.equal(d(blocked.next, 0, 0, T0 + 30 * 24 * HOUR).action, "BLOCK", "never expires on its own");
});

test("a clean 24h probation clears itself", () => {
  const probation = d(d(null, 6).next, 0, 0, T0 + 6 * MIN).next!;
  const later = d(probation, 0, 0, T0 + 5 * MIN + 25 * HOUR);
  assert.equal(later.action, "ALLOW"); assert.equal(later.transition, "CLEARED"); assert.equal(later.next, null);
  assert.equal(d(probation, 6, 0, T0 + 5 * MIN + 25 * HOUR).transition, "FROZE", "a fresh burst still freezes");
});

test("a known e-mail/phone donor gets double thresholds (12)", () => {
  assert.equal(d(null, 11, 0, T0, true).action, "ALLOW");
  assert.equal(d(null, 12, 0, T0, true).action, "COOLDOWN");
});

test("the strictest key wins (block > freeze > allow)", () => {
  const frozen = d(null, 6), blocked = { action: "BLOCK" as const, next: null, transition: null, retryAt: null };
  assert.equal(strictest([d(null, 0), frozen]).action, "COOLDOWN");
  assert.equal(strictest([frozen, blocked, d(null, 0)]).action, "BLOCK");
  assert.equal(strictest([]).action, "ALLOW");
});

test("settings are bounded, default to MONITOR, and the server switch can only reduce enforcement", () => {
  assert.equal(DEFAULT_GUARD_SETTINGS.mode, "MONITOR");
  const n = normalizeGuardSettings({ mode: "ENFORCE", stage1: 0, stage2: 9999, cooldownMinutes: "7" });
  assert.equal(n.stage1, 3); assert.equal(n.stage2, 50); assert.equal(n.cooldownMinutes, 7);
  assert.equal(normalizeGuardSettings({ mode: "ENFORCE" }, "OFF").mode, "OFF");
  assert.equal(normalizeGuardSettings({ mode: "ENFORCE" }, "MONITOR").mode, "MONITOR");
  assert.equal(normalizeGuardSettings({ mode: "OFF" }, "ENFORCE").mode, "OFF", "env cannot raise enforcement");
  assert.equal(normalizeGuardSettings({ mode: "bogus" }).mode, "MONITOR");
});

test("identity normalizers", () => {
  assert.equal(normEmail("  A.B@Example.COM "), "a.b@example.com"); assert.equal(normEmail("nope"), null);
  assert.equal(normPhone("+90 555 123 45 67"), "905551234567"); assert.equal(normPhone("0090 555 123 4567"), "905551234567"); assert.equal(normPhone("123"), null);
  assert.equal(normDevice("sess_1763000000_abcdef"), "sess_1763000000_abcdef"); assert.equal(normDevice("<script>"), null);
});

test("trusted-device mark: valid, tamper-proof, expiring, and useless without the server secret", () => {
  const secret = "x".repeat(32), mark = issueTrustMark(T0, secret);
  assert.equal(verifyTrustMark(mark, T0 + HOUR, secret), true);
  assert.equal(verifyTrustMark(mark, T0 + 366 * 24 * HOUR, secret), false, "expires after a year");
  assert.equal(verifyTrustMark(mark, T0, "y".repeat(32)), false, "other secret");
  const [p, m] = mark.split("."); const forged = Buffer.from(JSON.stringify({ v: 1, exp: T0 * 10 })).toString("base64url");
  assert.equal(verifyTrustMark(forged + "." + m, T0, secret), false, "forged payload");
  assert.equal(verifyTrustMark(p + "." + m + ".x", T0, secret), false);
  assert.equal(verifyTrustMark(undefined, T0, secret), false);
  assert.throws(() => issueTrustMark(T0, "short"));
});
