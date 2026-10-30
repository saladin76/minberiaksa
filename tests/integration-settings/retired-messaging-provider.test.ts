import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as runtime from "../../lib/communication/communication-runtime-types";
import * as locales from "../../lib/locales";
import type { CommunicationSenderConfig } from "../../lib/communication/sender-router";

function load<T>(file: string, deps: Record<string, unknown>) {
  const mod = { exports: {} as T };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date, Map, Set, console, process: { env: { DATABASE_URL: "fixture" } }, require: (id: string) => deps[id] ?? {} });
  return mod.exports;
}
test("retired and channel-mismatched providers cannot win direct, default or explicit-rule routing", () => {
  const router = load<{ resolveSender: (request: unknown, senders: CommunicationSenderConfig[], rules?: unknown[]) => { sender?: CommunicationSenderConfig; skipped?: boolean } }>("lib/communication/sender-router.ts", { "@/lib/locales": locales, "./communication-runtime-types": runtime });
  assert.equal(runtime.isCommunicationProvider("TWILIO"), false);
  const old: CommunicationSenderConfig = { id: "old", channel: "WHATSAPP", provider: "TWILIO", name: "Retired", isDefault: true, enabled: true, status: "ACTIVE" };
  const current = { ...old, id: "current", provider: "META_WHATSAPP", isDefault: false };
  const request = { channel: "WHATSAPP", locale: "ar", purpose: "MARKETING" };
  assert.equal(router.resolveSender(request, [old]).skipped, true);
  assert.equal(router.resolveSender(request, [old, current], [{ channel: "WHATSAPP", senderId: "old", fallbackSenderId: "current", enabled: true }]).sender?.id, "current");
  assert.equal(router.resolveSender(request, [{ ...current, provider: "ELASTIC_EMAIL" }]).skipped, true);
});
test("sender creation, edits and default promotion cannot revive a retired account, while history remains intact", async () => {
  let writes = 0;
  const old = { id: "old", channel: "WHATSAPP", provider: "TWILIO", name: "Retired", isDefault: true, enabled: true, status: "ACTIVE" };
  const current = { ...old, id: "current", provider: "META_WHATSAPP", isDefault: false };
  const original = JSON.stringify(old), queries: unknown[] = [];
  const prisma = { communicationSender: { findMany: async (query: unknown) => { queries.push(query); return [old, current]; }, findUnique: async () => old, create: async () => { writes++; }, update: async () => { writes++; }, updateMany: async () => { writes++; } }, $transaction: async () => { writes++; } };
  const service = load<{ listSenders: () => Promise<{ id: string }[]>; createSender: (input: unknown) => Promise<{ ok: boolean }>; updateSender: (id: string, input: unknown) => Promise<{ ok: boolean; status: number }>; setDefaultSender: (id: string) => Promise<{ ok: boolean; status: number }> }>("lib/communication/sender-service.ts", { "@/lib/prisma": { prisma }, "@/lib/audit-log": { writeAuditLog: async () => {} }, "./communication-runtime-types": runtime });
  assert.deepEqual((await service.listSenders()).map(row => row.id), ["current"]);
  assert.doesNotMatch(JSON.stringify(queries), /TWILIO/);
  assert.equal((await service.createSender({ channel: "EMAIL", provider: "TWILIO", name: "old" })).ok, false);
  assert.equal((await service.createSender({ channel: "EMAIL", provider: "META_WHATSAPP", name: "wrong channel" })).ok, false);
  assert.equal((await service.updateSender("old", { enabled: true })).status, 410);
  assert.equal((await service.setDefaultSender("old")).status, 410);
  assert.equal(writes, 0); assert.equal(JSON.stringify(old), original);
});
test("the sender HTTP schema refuses retired and mismatched providers before calling persistence", async () => {
  let writes = 0;
  const route = load<{ POST: (request: { json: () => Promise<unknown> }) => Promise<{ status: number }> }>("app/api/dashboard/communication/senders/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, opts?: { status: number }) => ({ body, status: opts?.status ?? 200 }) } }, zod: { z },
    "next-auth": { getServerSession: async () => ({ user: { id: "operator" } }) }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => null },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({}) }, "@/lib/communication/communication-runtime-types": runtime,
    "@/lib/communication/sender-service": { createSender: async () => { writes++; return { ok: true, data: {} }; } },
  });
  for (const provider of ["TWILIO", "SENDGRID", "META_WHATSAPP"]) assert.equal((await route.POST({ json: async () => ({ channel: "EMAIL", provider, name: "Rejected fixture" }) })).status, 400);
  assert.equal(writes, 0);
});
test("platform health no longer queries or displays the retired messaging integration", async () => {
  const queried: string[] = [];
  const route = load<{ GET: () => Promise<{ body: { platforms: { platform: string }[] } }> }>("app/api/admin/marketing-intelligence/platform-sync-summary/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown) => ({ body }) } }, "next-auth": { getServerSession: async () => ({ user: { id: "operator" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => null },
    "@/lib/prisma": { prisma: { marketingPlatformConnection: { findMany: async ({ where }: { where: { platform: string } }) => { queried.push(where.platform); return []; } }, platformSyncRun: { findFirst: async () => null } } },
  });
  const result = await route.GET(); assert.equal(queried.length, 5);
  assert.ok(!queried.includes("TWILIO")); assert.ok(result.body.platforms.every(row => row.platform !== "TWILIO"));
});
