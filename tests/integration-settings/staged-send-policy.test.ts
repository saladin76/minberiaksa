import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stagedConfigFor, waveFor, releaseAt, sliceOf, isSpamBlock, shouldHold, lastWaveOffsetMinutes, DEFAULT_STAGED } from "../../lib/communication/staged-send-policy";

const cfg = stagedConfigFor({ channel: "EMAIL", purpose: "MARKETING", metadata: null });
const now = new Date("2026-11-20T09:00:00Z"), DAY = 864e5, H = 3600e3;
const ago = (days: number) => new Date(now.getTime() - days * DAY);

test("waves: engaged first, then recent donors, then past openers, then everyone else", () => {
  assert.equal(waveFor({ lastEngagedAt: ago(10), lastPaidAt: null, now, cfg }), 1);
  assert.equal(waveFor({ lastEngagedAt: null, lastPaidAt: ago(100), now, cfg }), 1, "donated within 180 days");
  assert.equal(waveFor({ lastEngagedAt: null, lastPaidAt: ago(300), now, cfg }), 2);
  assert.equal(waveFor({ lastEngagedAt: ago(400), lastPaidAt: null, now, cfg }), 3);
  assert.equal(waveFor({ lastEngagedAt: null, lastPaidAt: ago(800), now, cfg }), 4);
  assert.equal(waveFor({ lastEngagedAt: null, lastPaidAt: null, now, cfg }), 4);
});

test("release times are measured from the campaign's own start (now or scheduled), never a clock time", () => {
  for (const start of [new Date("2026-11-20T13:00:00Z"), new Date("2026-11-21T05:00:00Z")]) {
    assert.equal(releaseAt(1, "x", start, cfg), null, "wave 1 at once");
    assert.equal(releaseAt(2, "x", start, cfg)!.getTime() - start.getTime(), 2 * H);
    assert.equal(releaseAt(3, "x", start, cfg)!.getTime() - start.getTime(), 3 * H);
    const off = releaseAt(4, "x", start, cfg)!.getTime() - start.getTime();
    assert.ok(off >= 4 * H && off <= 7 * H && off % H === 0, "rest in hourly slices 4h..7h");
  }
  assert.equal(lastWaveOffsetMinutes(cfg), 7 * 60, "the last wave starts 7 hours after the start (same day)");
});

test("the rest is split evenly and stably into hourly slices", () => {
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) counts[sliceOf("cursor-" + i, 4)]++;
  for (const c of counts) assert.ok(c > 4500 && c < 5500, "≈ a quarter each: " + counts);
  assert.equal(sliceOf("same-id", 4), sliceOf("same-id", 4), "a resume never reshuffles anyone");
});

test("applies only to marketing e-mail, can be switched off per campaign, bounded settings", () => {
  assert.equal(cfg.enabled, true); assert.deepEqual({ ...cfg }, { ...DEFAULT_STAGED });
  assert.equal(stagedConfigFor({ channel: "WHATSAPP", purpose: "MARKETING" }).enabled, false);
  assert.equal(stagedConfigFor({ channel: "EMAIL", purpose: "TRANSACTIONAL" }).enabled, false);
  assert.equal(stagedConfigFor({ channel: "EMAIL", purpose: "MARKETING", metadata: { staged: { enabled: false } } }).enabled, false);
  const b = stagedConfigFor({ channel: "EMAIL", metadata: { staged: { waveGapMinutes: 1, restSlices: 99, holdSpamRatePct: 0 } } });
  assert.equal(b.waveGapMinutes, 15); assert.equal(b.restSlices, 12); assert.equal(b.holdSpamRatePct, 1);
});

test("spam classification uses the real Elastic messages; invalid/unsubscribed/throttling are not spam", () => {
  assert.equal(isSpamBlock("Delivery failed due to account problem or spam block. Will attempt again at a later date."), true);
  assert.equal(isSpamBlock("Delivery not attempted because Contact's status was 'Invalid' at the time of sending."), false);
  assert.equal(isSpamBlock("Delivery not attempted because Contact's status was 'Unsubscribed' at the time of sending."), false);
  assert.equal(isSpamBlock("Insufficient system storage. The server response was: 4.2.2 The recipient's inbox is out of storage"), false);
  assert.equal(isSpamBlock("Error in processing. The server response was: 4.3.2 Temporary server error. Please try again later"), false);
  assert.equal(isSpamBlock(null), false);
});

test("hold the remaining waves only on a meaningful sample at or above the threshold", () => {
  assert.equal(shouldHold({ processed: 199, spamBlocked: 199, cfg }), false, "too few to judge");
  assert.equal(shouldHold({ processed: 2000, spamBlocked: 99, cfg }), false, "4.95%");
  assert.equal(shouldHold({ processed: 2000, spamBlocked: 100, cfg }), true, "5%");
});

test("executor hooks are lazy and fail-open, stage before quiet hours, and check the hold before releasing", () => {
  const ex = fs.readFileSync("lib/communication/campaign-send-executor.ts", "utf8");
  assert.doesNotMatch(ex, /^import .*staged-send/m, "no static import (sandboxed fixtures stay valid)");
  assert.match(ex, /await import\("\.\/staged-send"\)\)\.queueStagedRecipients/);
  assert.match(ex, /return plan;\s*\}\s*\}/, "on error the batch is sent as before");
  assert.ok(ex.indexOf("plan = await stageEmailWaves(") < ex.indexOf("const quietSlice = await queueRecipientQuietHours("));
  assert.ok(ex.indexOf("const held = await stagedWavesHeld(fresh);") < ex.indexOf("await loadDueQuietRecipients(campaignId, liveGate.controls, deferredBatchSize)"));
  const st = fs.readFileSync("lib/communication/staged-send.ts", "utf8");
  assert.match(st, /update: \{\}, \/\/ a resumed walk never moves anyone's wave/);
  assert.match(st, /communicationCampaignDeferredRecipient\.upsert/, "reuses the existing deferral queue");
});
