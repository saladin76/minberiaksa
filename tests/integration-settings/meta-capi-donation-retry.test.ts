import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routePath = "app/api/admin/ads/donation-detail/[id]/retry-meta/route.ts";

test("manual Meta Donate retry is authorized before reading the donation", () => {
  const source = readFileSync(routePath, "utf8");
  const post = source.slice(source.indexOf("export async function POST"));

  const authorize = post.indexOf('requireAdminOrDashboardPermission(session, "ads")');
  const readDonation = post.indexOf("prisma.donation.findUnique");
  assert.ok(authorize >= 0);
  assert.ok(readDonation > authorize);
});

test("manual Meta Donate retry only accepts paid donations that have not been marked sent", () => {
  const source = readFileSync(routePath, "utf8");
  const post = source.slice(source.indexOf("export async function POST"));

  assert.match(post, /donation\.status !== "PAID" \|\| donation\.paidAt == null/);
  assert.match(post, /donation\.conversionEventsSentAt != null/);
  assert.match(post, /sendDonationServerConversions\(id, \{ force: true, includeGa4: false \}\)/);
});

test("retry uses the canonical Donate event id and can skip GA4 without skipping Meta", () => {
  const sender = readFileSync("lib/tracking/donation-conversion-server.ts", "utf8");
  const route = readFileSync(routePath, "utf8");

  assert.match(sender, /const eventId = metaDonationEventId\(row\.id, "success"\)/);
  assert.match(sender, /if \(options\.includeGa4 !== false\) \{[\s\S]*?sendGa4Purchase/);
  assert.match(route, /includeGa4: false/);
  assert.match(route, /action: "ads\.donation\.meta-capi-donate\.retried"/);
});

test("details dialog only offers retry for a paid Meta donation and keeps the error visible", () => {
  const source = readFileSync("components/dashboard/DonationDetailsDialog.tsx", "utf8");

  assert.match(source, /donation\.status === "PAID" && result\.platform === "meta" && !localSentAt/);
  assert.match(source, /setRetryError\(message\)/);
  assert.match(source, /\{retryError \? <p role="alert"/);
  assert.match(source, /onMetaDonateSent\(sentAt\)/);
});
