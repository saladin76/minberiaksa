import assert from "node:assert/strict";
import test from "node:test";
import { parseClarityExport } from "../scripts/clarity-export-inventory.mjs";

const window = {
  fromUtc: "2026-11-01T21:00:00.000Z",
  toUtc: "2026-11-09T21:00:00.000Z",
  timeZone: "Europe/Istanbul",
  reviewSalt: Buffer.from("synthetic-test-salt"),
};

test("event inventory filters a half-open UTC window and emits only anonymized, normalized details", () => {
  const csv = [
    "Session ID,Event Name,Timestamp,Page URL,Device,Browser,Donor Email",
    'session-secret-1,donation_checkout_view,2026-11-02T00:00:00+03:00,https://minberiaksa.org/ar/payment-pending/123456789?token=private,Mobile,Chrome 120,donor@example.org',
    'session-secret-1,dead click,2026-11-02T00:00:02+03:00,https://minberiaksa.org/ar/payment-pending/123456789?email=private@example.org,Mobile,Chrome 120,donor@example.org',
    'session-secret-2,first_click,2026-11-10T00:00:00+03:00,https://minberiaksa.org/ar/zakat,Desktop,Firefox,',
    'session-secret-3,first_click,2026-11-02 00:00:00,https://minberiaksa.org/ar/zakat,Desktop,Firefox,',
  ].join("\r\n");

  const report = parseClarityExport(csv, window);
  const serialized = JSON.stringify(report);
  assert.equal(report.export_kind, "event_rows");
  assert.equal(report.input_rows, 4);
  assert.equal(report.rows_in_window, 2);
  assert.equal(report.rows_outside_window, 1);
  assert.equal(report.rows_without_explicit_timestamp, 1);
  assert.equal(report.distinct_sessions_in_window, 1);
  assert.equal(report.window.from_utc, "2026-11-01T21:00:00.000Z");
  assert.equal(report.window.to_utc_exclusive, "2026-11-09T21:00:00.000Z");
  assert.deepEqual(report.timeline.map(({ day, hour_istanbul, offset_from_first_in_window_ms }) => ({
    day, hour_istanbul, offset_from_first_in_window_ms,
  })), [
    { day: "2026-11-02", hour_istanbul: "00", offset_from_first_in_window_ms: 0 },
    { day: "2026-11-02", hour_istanbul: "00", offset_from_first_in_window_ms: 2000 },
  ]);
  assert.deepEqual(report.route_inventory, [{ route: "/ar/payment-pending", count: 2 }]);
  assert.match(report.timeline[0].review_key, /^S-[a-f0-9]{12}$/);
  assert.equal(report.timeline[0].review_key, report.timeline[1].review_key);
  assert.doesNotMatch(serialized, /session-secret|donor@example|123456789|token=private|payment-pending\/123/);
  assert.equal(report.replay_videos_reviewed, 0);
});

test("recording indexes retain aggregate coverage only and are never represented as replay reviews", () => {
  const csv = [
    "Session ID,Timestamp,Recording URL,Device,Browser",
    "session-secret-1,2026-11-02T01:00:00Z,https://clarity.microsoft.com/recording?token=private,Mobile,Chrome",
  ].join("\n");
  const report = parseClarityExport(csv, window);
  assert.equal(report.export_kind, "recording_index");
  assert.equal(report.rows_in_window, 1);
  assert.equal(report.distinct_sessions_in_window, 1);
  assert.deepEqual(report.event_inventory, []);
  assert.deepEqual(report.timeline, []);
  assert.equal(report.replay_videos_reviewed, 0);
  assert.doesNotMatch(JSON.stringify(report), /session-secret|clarity\.microsoft|token=private/);
});

test("CSV quoting, event label suppression, and absent session IDs are handled safely", () => {
  const csv = [
    "Event,Event Time,Page,Device,Browser,Description",
    '"page view, campaign","2026-11-02T10:00:00Z","/ar/campaign?email=hidden",Tablet,"Samsung Internet 25","line one',
    'line two, donor@example.org"',
    'donor@example.org,"2026-11-02T10:00:01Z","/ar/campaign",Tablet,"Samsung Internet 25",private',
  ].join("\r\n");
  const report = parseClarityExport(csv, window);
  assert.equal(report.rows_in_window, 2);
  assert.deepEqual(report.event_inventory, [
    { name: "[redacted event label]", count: 1 },
    { name: "page view, campaign", count: 1 },
  ]);
  assert.equal(report.timeline[0].review_key, undefined);
  assert.equal(report.device_inventory[0].device, "tablet");
  assert.equal(report.browser_inventory[0].browser, "Samsung Internet");
  assert.doesNotMatch(JSON.stringify(report), /donor@example|line one|line two|email=hidden/);
});

test("invalid boundaries, timezone, and malformed CSV fail closed", () => {
  assert.throws(() => parseClarityExport("A\nx", { ...window, fromUtc: "2026-11-02" }), /explicit UTC offset/);
  assert.throws(() => parseClarityExport("A\nx", { ...window, toUtc: window.fromUtc }), /earlier than/);
  assert.throws(() => parseClarityExport("A\nx", { ...window, timeZone: "Not/AZone" }), /time zone/i);
  assert.throws(() => parseClarityExport('A\n"unterminated', window), /unterminated/);
});

test("phone-like labels and IDs are suppressed, including in otherwise public paths", () => {
  const report = parseClarityExport([
    "Session ID,Event Name,Timestamp,Page URL",
    "session-secret,Call 90 532 123 4567,2026-11-02T10:00:00Z,/ar/campaign/90-532-123-4567",
  ].join("\n"), window);
  assert.equal(report.event_inventory[0].name, "[redacted event label]");
  assert.equal(report.route_inventory[0].route, "/ar/campaign/[redacted]");
  assert.doesNotMatch(JSON.stringify(report), /session-secret|90 532 123 4567|90-532-123-4567/);
});

test("empty timestamped event exports preserve their export type and zero denominator", () => {
  const report = parseClarityExport("Session ID,Event Name,Timestamp\n", window);
  assert.equal(report.export_kind, "event_rows");
  assert.equal(report.input_rows, 0);
  assert.equal(report.rows_in_window, 0);
  assert.equal(report.replay_videos_reviewed, 0);
});
