import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as phone from "../../lib/communication/phone";
import * as timeline from "../../lib/communication/inbox-timeline";

test("refresh retains loaded history, deduplicates by archive id and updates provider states", () => {
  const result = timeline.mergeInboxTimeline([
    { id: "old", at: "2026-10-25", status: null },
    { id: "sent", at: "2026-10-26", status: "SENT" },
  ], [
    { id: "sent", at: "2026-10-26", status: "READ" },
    { id: "new", at: "2026-10-27", status: null },
  ]);
  assert.deepEqual(result.map(item => item.id), ["old", "sent", "new"]);
  assert.equal(result[1].status, "READ");
});

function harness(status: string, databaseFailure = false) {
  const now = new Date("2026-10-26T11:00:00Z");
  const outboundAt = new Date("2026-10-26T12:00:00Z");
  const calls: Array<Record<string, unknown>> = [];
  const prisma = {
    $runCommandRaw: async (query: { aggregate: string; pipeline: Array<Record<string, unknown>> }) => {
      if (databaseFailure) throw new Error("fixture database unavailable");
      calls.push(query);
      const inbound = query.aggregate === "CommunicationProviderEvent";
      return { cursor: { firstBatch: [{ _id: { senderId: "business", phone: "+15555555555" }, count: 1,
        lastAt: inbound ? now : outboundAt, lastReplyAt: timeline.INBOX_ACCEPTED_STATUSES.includes(status) ? outboundAt : null,
        lastPayload: { text: "Incoming" },
      }] } };
    },
    donorCommunicationProfile: { findMany: async () => [] },
    communicationSender: { findMany: async () => [{ id: "business", name: "Business" }] },
    auditLog: { findMany: async () => [] },
    communicationProviderEvent: { findMany: async () => [{ id: "incoming", eventType: "inbound_message", receivedAt: now, payloadSanitized: { text: "Incoming" }, senderId: "business" }] },
    communicationDelivery: { findMany: async () => [{ id: "outgoing", createdAt: outboundAt, renderedBody: "Reply", status, senderId: "business" }] },
  };
  const dependencies: Record<string, unknown> = {
    "@/lib/prisma": { prisma }, "@/lib/audit-log": {}, "./phone": phone, "./inbox-timeline": timeline,
  };
  const output = ts.transpileModule(fs.readFileSync("lib/communication/conversation-service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { listConversations: () => Promise<Array<{ needsReply: boolean }>>; getConversation: (id: string) => Promise<{ timeline: Array<{ id: string; status: string | null }> }> } };
  new vm.Script(output).runInNewContext({ module: loaded, exports: loaded.exports, Date, Map, console, process: { env: { DATABASE_URL: "fixture" } }, require: (id: string) => {
    if (!(id in dependencies)) throw new Error("Unexpected dependency " + id);
    return dependencies[id];
  } });
  return { service: loaded.exports, calls };
}

test("database failure is not returned as an empty successful inbox", async () => {
  await assert.rejects(harness("SENT", true).service.listConversations(), /fixture database unavailable/);
});

for (const status of ["FAILED", "SKIPPED", "RENDERED", "QUEUED"]) test(`${status} attempt leaves an incoming conversation awaiting reply`, async () => {
  const { service, calls } = harness(status);
  assert.equal((await service.listConversations())[0].needsReply, true);
  const query = calls.find(row => row.aggregate === "CommunicationDelivery");
  assert.ok(JSON.stringify(query).includes('"$in":["$status",["SENT","DELIVERED","READ"]]'));
});

for (const status of ["SENT", "DELIVERED", "READ"]) test(`${status} reply resolves the pending conversation and keeps stable timeline ids`, async () => {
  const { service } = harness(status);
  assert.equal((await service.listConversations())[0].needsReply, false);
  const detail = await service.getConversation("business:+15555555555");
  assert.deepEqual(Array.from(detail.timeline, item => item.id), ["event:incoming", "delivery:outgoing"]);
  assert.equal(detail.timeline[1].status, status);
});

test("provider acceptance with archive failure reports uncertainty rather than recorded success", async () => {
  let sends = 0;
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "@/lib/prisma": { prisma: {
      donorCommunicationProfile: { findFirst: async () => null },
      communicationProviderEvent: { findFirst: async () => ({ receivedAt: new Date(), providerMessageId: "incoming" }) },
    } },
    "./delivery-log-service": { createDeliveryRecord: async () => ({ ok: true, data: { id: "archived" } }), markDeliveryStatus: async () => ({ ok: false }) },
    "./conversation-service": { parseConversationId: () => ({ senderId: "business", phone: "+15555555555" }) },
    "./phone": phone,
    "./sender-resolution": { loadSenderRoutingSnapshot: async () => ({ raw: new Map([["business", { id: "business", phoneNumberId: "fixture-number" }]]) }) },
    "./runtime-config": { getActiveMetaWhatsappRuntimeConfig: async () => ({}) },
    "./providers/meta-whatsapp/messages": { sendTextMessage: async () => { sends++; return { ok: true, providerMessageId: "accepted" }; } },
  };
  const output = ts.transpileModule(fs.readFileSync("lib/communication/conversation-reply-service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { sendConversationReply: (id: string, body: string) => Promise<{ ok: boolean; reason?: string }> } };
  new vm.Script(output).runInNewContext({ module: loaded, exports: loaded.exports, Date, Map, process: { env: { DATABASE_URL: "fixture" } }, require: (id: string) => {
    if (!(id in dependencies)) throw new Error("Unexpected dependency " + id);
    return dependencies[id];
  } });
  const result = await loaded.exports.sendConversationReply("business:+15555555555", "Fixture reply");
  assert.equal(sends, 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ACCEPTED_UNRECORDED");
});
