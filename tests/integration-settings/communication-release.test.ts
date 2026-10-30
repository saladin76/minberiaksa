import * as unsubscribe from "../../lib/communication/whatsapp-template-unsubscribe";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as metaErrors from "../../lib/communication/providers/meta-whatsapp/errors";
import * as phone from "../../lib/communication/phone";
import * as locales from "../../lib/locales";
import * as runtimeTypes from "../../lib/communication/communication-runtime-types";
import { donorAccountStatus } from "../../lib/dashboard/donor-account";
import { donorProfileSchema } from "../../lib/dashboard/donor-profile";
import type { NormalizedWebhookEvent } from "../../lib/communication/providers/meta-whatsapp/types";
import type { SenderRoutingRequest, CommunicationSenderConfig, SenderRoutingRuleConfig, SenderRoutingResult } from "../../lib/communication/sender-router";
import * as inboxTimeline from "../../lib/communication/inbox-timeline";
import * as statusProgress from "../../lib/communication/delivery-status-progress";

function load<T>(file: string, dependencies: Record<string, unknown>) {
  const loaded = { exports: {} as T };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ module: loaded, exports: loaded.exports, Date, Map, Set, Buffer, URL, console: { ...console, error() {} }, process: { env: { DATABASE_URL: "fixture", GOOGLE_CLIENT_ID: "fixture-id", GOOGLE_CLIENT_SECRET: "fixture-secret", NEXTAUTH_SECRET: "fixture-auth" } },
    require: (name: string) => { if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name); return dependencies[name]; } });
  return loaded.exports;
}

const parser = () => load<{ parseWebhookPayload: (body: unknown) => NormalizedWebhookEvent[] }>("lib/communication/providers/meta-whatsapp/webhooks.ts", {
  "node:crypto": {}, "../../runtime-config": {}, "./errors": metaErrors,
});
const payload = (field = "smb_message_echoes", to: string | null = "15555555555") => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field, value: {
  metadata: { phone_number_id: "business" }, message_echoes: [{ id: "wamid-app", from: "905555555555", to, timestamp: "1793030400", type: "text", text: { body: "App reply" } }],
} }] }] });

test("Business app echoes retain recipient, direction, media and stable provider identity", () => {
  const events = parser().parseWebhookPayload(payload());
  assert.equal(events.length, 1); const event = events[0];
  assert.equal(event.kind, "echo");
  if (event.kind !== "echo") throw new Error("wrong direction");
  assert.equal(event.recipient, "15555555555"); assert.equal(event.text, "App reply");
  assert.equal(event.idempotencyKey, "wa:echo:wamid-app");
  assert.equal(parser().parseWebhookPayload(payload("messages")).length, 0);
  assert.equal(parser().parseWebhookPayload(payload("smb_message_echoes", null)).length, 0);
});

test("echo webhook redelivery archives once, never opts out the donor or attributes a donor reply", async () => {
  const records: Array<Record<string, unknown>> = [];
  const service = load<{ processWhatsappEvents: (events: NormalizedWebhookEvent[]) => Promise<{ duplicates: number; persistenceErrors: number; inbound: number }> }>("lib/communication/webhook-service.ts", {
    "@/lib/prisma": { prisma: {
      communicationSender: { findFirst: async () => ({ id: "sender" }) },
      communicationDelivery: { findFirst: async () => null },
      communicationProviderEvent: { findMany: async () => [], create: async ({ data }: { data: Record<string, unknown> }) => {
        if (records.length) throw { code: "P2002" }; records.push(data);
      } },
    } }, "./phone": phone, "./whatsapp-template-unsubscribe": unsubscribe,
    "./delivery-log-service": {}, "./delivery-status-progress": {},
  });
  const events = parser().parseWebhookPayload(payload());
  const first = await service.processWhatsappEvents(events); const duplicate = await service.processWhatsappEvents(events);
  assert.equal(first.inbound, 0); assert.equal(first.persistenceErrors, 0); assert.equal(duplicate.duplicates, 1);
  assert.equal(records.length, 1); assert.equal(records[0].eventType, "outbound_echo"); assert.equal(records[0].status, "SENT");
  assert.equal(records[0].recipient, "+15555555555");
});

test("archive errors request webhook retry instead of claiming successful persistence", async () => {
  const service = load<{ processWhatsappEvents: (events: NormalizedWebhookEvent[]) => Promise<{ persistenceErrors: number }> }>("lib/communication/webhook-service.ts", {
    "@/lib/prisma": { prisma: { communicationSender: { findFirst: async () => ({ id: "sender" }) }, communicationDelivery: { findFirst: async () => null },
      communicationProviderEvent: { findMany: async () => [], create: async () => { throw new Error("database unavailable"); } } } },
    "./phone": phone, "./whatsapp-template-unsubscribe": unsubscribe,
    "./delivery-log-service": {}, "./delivery-status-progress": {},
  });
  assert.equal((await service.processWhatsappEvents(parser().parseWebhookPayload(payload()))).persistenceErrors, 1);
});

test("app message status persists monotonically even when receipts precede the echo or arrive late", async () => {
  const rows: Array<Record<string, unknown>> = [];
  const service = load<{ processWhatsappEvents: (events: NormalizedWebhookEvent[]) => Promise<unknown> }>("lib/communication/webhook-service.ts", {
    "@/lib/prisma": { prisma: {
      communicationSender: { findFirst: async () => ({ id: "sender" }) }, communicationDelivery: { findFirst: async () => null },
      communicationProviderEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => { if (rows.some(row => row.idempotencyKey === data.idempotencyKey)) throw { code: "P2002" }; rows.push(data); },
        findMany: async () => rows.filter(row => String(row.eventType).startsWith("status_")),
        updateMany: async ({ where, data }: { where: { status: { in: string[] } }; data: Record<string, unknown> }) => {
          for (const row of rows) if (row.eventType === "outbound_echo" && where.status.in.includes(String(row.status))) Object.assign(row, data);
        },
      },
    } }, "./phone": phone, "./whatsapp-template-unsubscribe": unsubscribe,
    "./delivery-log-service": {}, "./delivery-status-progress": statusProgress,
  });
  const event = parser().parseWebhookPayload(payload())[0];
  const receipt = (status: "SENT" | "DELIVERED" | "READ"): NormalizedWebhookEvent => ({ kind: "status", providerMessageId: event.providerMessageId, status,
    phoneNumberId: "business", recipient: "15555555555", timestamp: null, errorMessage: null, idempotencyKey: "status:" + status });
  await service.processWhatsappEvents([receipt("READ"), event, receipt("SENT"), receipt("DELIVERED"), event]);
  const echoes = rows.filter(row => row.eventType === "outbound_echo"); assert.equal(echoes.length, 1); assert.equal(echoes[0].status, "READ");
});

test("app replies resolve only their conversation and old timeline pages retain stored delivery evidence", async () => {
  const at = new Date("2026-10-26T10:00:00Z"); const replyAt = new Date("2026-10-26T11:00:00Z");
  const service = load<{
    listConversations: () => Promise<Array<{ id: string; needsReply: boolean }>>;
    getConversation: (id: string) => Promise<{ timeline: Array<{ kind: string; status: string }> }>;
  }>("lib/communication/conversation-service.ts", {
    "@/lib/prisma": { prisma: {
      donorCommunicationProfile: { findMany: async () => [] }, communicationSender: { findMany: async () => [{ id: "one", name: "One" }, { id: "two", name: "Two" }] }, auditLog: { findMany: async () => [] },
      communicationProviderEvent: { aggregateRaw: async (query:unknown) => JSON.stringify(query).includes("outbound_echo") ? [{ _id: { senderId: "one", phone: "+15555555555" }, count: 1, lastAt: replyAt, lastReplyAt: replyAt }] : ["one", "two"].map(senderId => ({ _id: { senderId, phone: "+15555555555" }, count: 1, lastAt: at })), findMany: async () => [{ id: "echo", providerMessageId: "wamid", eventType: "outbound_echo", status: "READ", receivedAt: replyAt, senderId: "one", deliveryId: null, payloadSanitized: { text: "Reply", media: { kind: "image" } } }] },
      communicationDelivery: { aggregateRaw: async () => [], findMany: async () => [] },
    } }, "@/lib/audit-log": {}, "./phone": phone, "./inbox-timeline": inboxTimeline, "@/lib/dashboard/donor-account": { donorAccountStatus },
  });
  const conversations = await service.listConversations();
  assert.equal(conversations.find(row => row.id.startsWith("one:"))?.needsReply, false);
  assert.equal(conversations.find(row => row.id.startsWith("two:"))?.needsReply, true);
  const detail = await service.getConversation("one:+15555555555");
  assert.equal(detail.timeline[0].kind, "outbound"); assert.equal(detail.timeline[0].status, "READ");
});

const router = load<{ resolveSender: (request: SenderRoutingRequest, senders: CommunicationSenderConfig[], rules: SenderRoutingRuleConfig[]) => SenderRoutingResult }>("lib/communication/sender-router.ts", { "@/lib/locales": locales, "./communication-runtime-types": runtimeTypes });
const sender = (id: string, patch: Partial<CommunicationSenderConfig> = {}): CommunicationSenderConfig => ({ id, name: id, channel: "WHATSAPP", provider: "META_WHATSAPP", status: "ACTIVE", enabled: true, ...patch });
const request: SenderRoutingRequest = { channel: "WHATSAPP", locale: "ar", country: "TR", purpose: "MARKETING" };
const rule: SenderRoutingRuleConfig = { id: "rule", channel: "WHATSAPP", locale: "ar", senderId: "primary", fallbackSenderId: "fallback", enabled: true };

test("routing respects capability constraints even for explicitly configured primary/fallback destinations", () => {
  for (const patch of [{ channel: "EMAIL" as const }, { enabled: false }, { status: "DISABLED" as const }, { supportedLocales: ["tr"] }, { supportedCountries: ["US"] }, { supportedPurposes: ["UTILITY"] }]) {
    const result = router.resolveSender(request, [sender("primary", patch), sender("fallback")], [rule]);
    assert.ok("sender" in result); if (!("sender" in result)) throw new Error("no result");
    assert.equal(result.sender.id, "fallback"); assert.equal(result.fallbackUsed, true); assert.equal(result.ruleId, "rule");
  }
});

test("routing specificity, priority and ties are deterministic and fallback cycles cannot recurse", () => {
  const senders = [sender("primary"), sender("fallback")];
  const specific = { ...rule, id: "specific", country: "TR", senderId: "fallback", priority: 99 };
  const result = router.resolveSender(request, senders, [rule, specific]);
  assert.ok("sender" in result); if ("sender" in result) assert.equal(result.sender.id, "fallback");
  const cycle = router.resolveSender(request, senders.map(row => ({ ...row, enabled: false })), [rule, { ...rule, senderId: "fallback", fallbackSenderId: "primary" }]);
  assert.ok("skipped" in cycle);
  const a = router.resolveSender(request, senders, []), b = router.resolveSender(request, [...senders].reverse(), []);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("routing storage failure cannot masquerade as empty configuration and select an environment sender", async () => {
  const service = load<{ loadSenderRoutingSnapshot: (channel: string) => Promise<unknown> }>("lib/communication/sender-resolution.ts", {
    "server-only": {}, "./sender-service": { listSenders: async (strict: boolean) => { assert.equal(strict, true); throw new Error("unavailable"); } },
    "./routing-rule-service": { listRoutingRules: async (_channel: string, strict: boolean) => { assert.equal(strict, true); return []; } },
    "./sender-router": router, "./runtime-config": { getActiveCommunicationRuntimeBundle: async () => ({}) },
  });
  await assert.rejects(service.loadSenderRoutingSnapshot("WHATSAPP"), /unavailable/);
});

test("registration markers distinguish guests, linked accounts and ambiguous legacy records without using donation success", () => {
  assert.equal(donorAccountStatus({ verifiedAt: new Date() }), "GUEST");
  assert.equal(donorAccountStatus({ password: "fixture-hash", verifiedAt: null }), "MEMBER");
  assert.equal(donorAccountStatus({ _count: { accounts: 1 } }), "MEMBER");
  assert.equal(donorAccountStatus({ verifiedAt: null, password: null }), "UNKNOWN");
  assert.equal(donorAccountStatus({ registeredAt: new Date(), password: null, _count: { accounts: 0 } }), "MEMBER");
  assert.equal(donorAccountStatus({ emailVerified: new Date(), verifiedAt: new Date(), password: null }), "UNKNOWN");
});

test("verified Google One Tap records explicit membership for new and returning donors", async () => {
  for (const existing of [false, true]) {
    const writes: Array<Record<string, unknown>> = [];
    const options = load<{ authOptions: { providers: Array<{ id?: string; authorize?: (input: unknown) => Promise<unknown> }> } }>("app/api/auth/[...nextauth]/options.ts", {
      "@auth/prisma-adapter": { PrismaAdapter: () => ({}) },
      "next-auth/providers/google": { default: (value: unknown) => value }, "next-auth/providers/facebook": { default: (value: unknown) => value },
      "next-auth/providers/credentials": { default: (value: unknown) => value }, "bcryptjs": {},
      "next/headers": { cookies: async () => ({ get: () => ({ value: "ar" }) }) }, "@/lib/otp": {}, "@/lib/locales": locales,
      "google-auth-library": { OAuth2Client: class { async verifyIdToken() { return { getPayload: () => ({ email: "fixture@example.test", email_verified: true, sub: "google-user" }) }; } } },
      "@/lib/users/account-claim": { completionData: () => ({}), findUserByEmail: async () => existing ? { id: "user", email: "fixture@example.test", emailVerified: new Date(), role: "DONOR" } : null },
      "@/lib/prisma": { prisma: { user: { create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return { ...data, id: "user" }; }, update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); } } } },
    });
    const oneTap = options.authOptions.providers.find(provider => provider.id === "google-onetap");
    assert.ok(oneTap?.authorize); assert.ok(await oneTap.authorize({ idToken: "verified-fixture-token" }));
    assert.equal(writes.length, 1); assert.ok(writes[0].registeredAt instanceof Date);
    assert.equal(donorAccountStatus({ registeredAt: writes[0].registeredAt as Date }), "MEMBER");
  }
});

test("profile validation normalizes supported fields and rejects authority, financial fields and malformed data", () => {
  const valid = { name: " Fixture ", email: "TEST@example.test", phone: "+1 555 555 5555", birthdate: "2000-01-01", updatedAt: "2026-10-26T00:00:00.000Z" };
  assert.equal(donorProfileSchema.parse(valid).email, "test@example.test");
  for (const patch of [{ role: "ADMIN" }, { password: "bad" }, { totalDonatedAmount: 3 }, { birthdate: "2000-02-30" }, { phone: "not-phone" }, { preferredLang: "xx" }, { name: " " }]) {
    assert.equal(donorProfileSchema.safeParse({ ...valid, ...patch }).success, false);
  }
});

type RouteResponse = { status: number; data: { error?: string; ok?: boolean } };
function profileRoute(role = "ADMIN", allowed = true, conflict = false) {
  const calls: Array<{ operation: string; query?: unknown }> = [];
  const route = load<{ PUT: (request: { json: () => Promise<unknown> }, context: { params: Promise<{ id: string }> }) => Promise<RouteResponse> }>("app/api/dashboard/donors/[id]/profile/route.ts", {
    "next/server": { NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ data, status: init?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "staff", role } }) }, "@/app/api/auth/[...nextauth]/options": {},
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => allowed ? null : { status: 403 } },
    "@/lib/dashboard/donor-profile": { donorProfileSchema }, "@/lib/locales": locales, "@/lib/geo/country-to-locale": { localeForCountry: () => "ar" }, "@/lib/communication/phone": phone,
    "@/lib/audit-log": { writeAuditLog: async (query: unknown) => { calls.push({ operation: "audit", query }); } },
    "@/lib/prisma": { prisma: {
      user: { findUnique: async () => { calls.push({ operation: "lookup" }); return { role: "DONOR", email: "test@example.test" }; } },
      $transaction: async (operation: (tx: unknown) => Promise<void>) => operation({
        user: { updateMany: async (query: unknown) => { calls.push({ operation: "profile", query }); return { count: conflict ? 0 : 1 }; } },
        auditLog: { create: async (query: unknown) => { calls.push({ operation: "audit", query }); } },
        donorCommunicationProfile: { updateMany: async (query: unknown) => { calls.push({ operation: "contact", query }); } },
      }),
    } },
  });
  return { calls, put: (body: unknown) => route.PUT({ json: async () => body }, { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) }) };
}
const profile = { name: "Fixture", phone: "+15555555555", preferredLang: "ar", updatedAt: "2026-10-26T00:00:00.000Z" };

test("donor profile mutation checks permission before reading and staff cannot change login or authority", async () => {
  const denied = profileRoute("STAFF", false); assert.equal((await denied.put(profile)).status, 403); assert.equal(denied.calls.length, 0);
  const staff = profileRoute("STAFF"); assert.equal((await staff.put({ ...profile, email: "other@example.test" })).status, 403); assert.equal(staff.calls.length, 0);
  assert.equal((await staff.put({ ...profile, role: "ADMIN" })).status, 400); assert.equal(staff.calls.length, 0);
});

test("profile edits atomically update contact routing and audit field names without touching donations or consent", async () => {
  const h = profileRoute("STAFF"); assert.equal((await h.put(profile)).status, 200);
  assert.deepEqual(h.calls.map(call => call.operation), ["lookup", "profile", "contact", "audit"]);
  const json = JSON.stringify(h.calls);
  assert.ok(!json.includes("whatsappOptIn")); assert.ok(!json.includes("doNotContact")); assert.ok(!json.includes("paidAt"));
  assert.ok(json.includes("updatedAt")); assert.ok(json.includes("DONOR_PROFILE_UPDATE"));
  const stale = profileRoute("ADMIN", true, true); assert.equal((await stale.put(profile)).data.error, "PROFILE_CONFLICT");
  assert.deepEqual(stale.calls.map(call => call.operation), ["lookup", "profile"]);
});

function paypalFixture(paid = false, missing = false) {
  let writes = 0, captures = 0;
  class PayPalError extends Error { status = 404; }
  const service = load<{
    completePayPalReturn: (input: { donationId: string; orderId: string }) => Promise<{ kind: string; accessToken?: string }>;
    reconcilePayPalDonation: (id: string) => Promise<{ outcome: string }>;
  }>("lib/donations/paypal-donation.ts", {
    "./mongo-null": { donationFieldEmpty: () => ({}), donationWhereAll: () => ({}) },
    "server-only": {}, "@/lib/events/after-response": {}, "@/lib/donations/recurring-schedule": {}, "@/lib/events/dispatch": {}, "@/lib/tracking/donation-conversion-server": {},
    "@/lib/prisma": { prisma: { donation: {
      findUnique: async () => ({ id: "donation", paidAt: paid ? new Date() : null, accessToken: "private-token", status: "PAID", paymentMethod: "PAYPAL", createdAt: new Date("2020-01-01"), paypalOrderId: "ORDER", providerRaw: { paypalRequest: { value: "10.00", currency: "USD" } } }),
      update: async () => { writes++; throw new Error("unexpected mutation"); },
      updateMany: async () => { writes++; throw new Error("unexpected mutation"); },
    } } },
    "@/lib/paypal": { PayPalError, isPayPalConfigured: () => true, getPayPalOrder: async () => { if (missing) throw new PayPalError(); throw new Error("unexpected lookup"); },
      capturePayPalOrder: async () => { captures++; throw new Error("unexpected capture"); } },
  });
  return { service, writes: () => writes, captures: () => captures };
}

test("wrong PayPal return tokens cannot fail a donation, reveal an existing access token or capture", async () => {
  for (const paid of [false, true]) {
    const h = paypalFixture(paid); const result = await h.service.completePayPalReturn({ donationId: "donation", orderId: "OTHER" });
    assert.equal(result.kind, "failed"); assert.equal(result.accessToken, undefined); assert.equal(h.writes(), 0); assert.equal(h.captures(), 0);
  }
  const h = paypalFixture(true); assert.equal((await h.service.completePayPalReturn({ donationId: "donation", orderId: "ORDER" })).kind, "paid");
  assert.equal(h.captures(), 0);
});

test("even an aged PayPal order returning 404 remains unresolved without a fabricated decline or repeated capture", async () => {
  const h = paypalFixture(false, true); assert.equal((await h.service.reconcilePayPalDonation("donation")).outcome, "open");
  assert.equal(h.writes(), 0); assert.equal(h.captures(), 0);
});

test("the existing user-update endpoint never serializes a stored password hash", async () => {
  const route = load<{ PUT: (request: { json: () => Promise<unknown> }, context: { params: Promise<{ id: string }> }) => Promise<{ data: Record<string, unknown> }> }>("app/api/users/[id]/route.ts", {
    "next/server": { NextResponse: { json: (data: unknown) => ({ data }) } }, "next-auth": { getServerSession: async () => ({ user: { id: "admin", role: "ADMIN" } }) },
    "../../auth/[...nextauth]/options": {}, "@/lib/dashboard/permissions": {}, "@/lib/dashboard/api-auth": {}, "@/lib/audit-log": {}, "@/lib/badge-criteria": {},
    "@/lib/dashboard/donation-usd-revenue": {}, "@/lib/communication/donor-communication-profile-service": {}, "@/lib/dashboard/donor-account": { donorAccountStatus },
    "@/lib/prisma": { prisma: { user: {
      findUnique: async () => ({ role: "DONOR", name: "Fixture", email: "fixture@example.test" }),
      update: async () => ({ id: "donor", role: "DONOR", name: "Updated", password: "FIXTURE_HASH_DO_NOT_RETURN" }),
    } } },
  });
  const response = await route.PUT({ json: async () => ({ name: "Updated" }) }, { params: Promise.resolve({ id: "donor" }) });
  assert.equal(response.data.password, undefined); assert.equal(response.data.hasPassword, true);
  assert.equal(JSON.stringify(response.data).includes("FIXTURE_HASH_DO_NOT_RETURN"), false);
});
