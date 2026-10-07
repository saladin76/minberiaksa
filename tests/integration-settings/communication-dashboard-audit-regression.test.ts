import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("WhatsApp do-not-contact blocks freeform replies in both smart send and inbox service", () => {
  const smart = read("lib/communication/smart-whatsapp-service.ts");
  const reply = read("lib/communication/conversation-reply-service.ts");
  const dialog = read("components/dashboard/SmartWhatsappDialog.tsx");
  const inbox = read("app/(dashboard)/dashboard/communication/inbox/_components/WhatsappInbox.tsx");

  assert.ok(smart.indexOf('if (ctx.doNotContact)') < smart.indexOf('if (mode === "FREEFORM")'));
  assert.ok(reply.indexOf('doNotContact: true') < reply.indexOf('const window = await replyWindowFor'));
  assert.match(dialog, /Boolean\(ctx\.doNotContact\)/);
  assert.match(inbox, /detail\.donor\?\.doNotContact/);
});

test("WhatsApp inbox distinguishes failures from empty state and refreshes live", () => {
  const inbox = read("app/(dashboard)/dashboard/communication/inbox/_components/WhatsappInbox.tsx");

  assert.match(inbox, /listError/);
  assert.match(inbox, /detailError/);
  assert.match(inbox, /setInterval[\s\S]*30_000/);
  assert.match(inbox, /setInterval[\s\S]*15_000/);
  assert.match(inbox, /آخر بيانات ناجحة/);
});

test("campaign audience eligibility is applied before count and pagination", () => {
  const route = read("app/api/communication/audience-candidates/route.ts");

  assert.match(route, /function channelEligibilityWhere/);
  assert.match(route, /const where = channelEligibilityWhere\(baseWhere, channel, eligibilityFilter\)/);
  assert.match(route, /prisma\.user\.count\(\{ where \}\)/);
  assert.doesNotMatch(route, /donors = donors\.filter/);
});

test("email tracking is scoped to email events and retries are readiness-gated", () => {
  const route = read("app/api/dashboard/communication/email/route.ts");
  const ui = read("app/(dashboard)/dashboard/communication/email/_components/EmailChannelDashboard.tsx");

  assert.match(route, /communicationProviderEvent\.count\(\{ where: \{ channel: CHANNEL \} \}\)/);
  assert.match(route, /getActiveElasticEmailRuntimeConfig/);
  assert.match(route, /senderReady:/);
  assert.match(ui, /retryReady/);
  assert.match(ui, /campaignId\]\);/);
});

test("email suppression preserves non-email channel preferences", () => {
  const suppression = read("lib/communication/email-suppression.ts");

  assert.match(suppression, /ensureProfilesForUsers\(\[user\.id\]\)/);
  assert.match(suppression, /emailOptIn: false/);
  assert.doesNotMatch(suppression, /create:[\s\S]*smsOptIn: false[\s\S]*whatsappOptIn: false/);
});

test("WhatsApp template readiness accepts real approved locales and exposes stale sync truth", () => {
  const route = read("app/api/dashboard/communication/whatsapp/route.ts");
  const ui = read("app/(dashboard)/dashboard/communication/whatsapp/_components/WhatsappChannelDashboard.tsx");

  assert.match(route, /variants\.flatMap\(\(variant\) => \[variant\.locale, variant\.languageCode\]\)/);
  assert.match(route, /const anyReady = readyWabas > 0/);
  assert.match(route, /ready: anyReady/);
  assert.match(route, /every\(\(v\) => Boolean\(v\.lastSyncedAt\)\)/);
  assert.match(ui, /PARTIAL:/);
  assert.match(ui, /templates\.rows\.every\(\(row\) => Boolean\(row\.lastSyncedAt\)\)/);
});
