import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as policy from "../../lib/tracking/google-script-policy";
import * as clarityPolicy from "../../lib/tracking/clarity-config";

function fixture() {
  let stored: Record<string, unknown> = { _id: { $oid: "a".repeat(24) }, gaMeasurementId: "G-FIXTURE", gaApiSecret: "private-fixture-secret" };
  const commands: Record<string, unknown>[] = [], audits: unknown[] = [];
  let denied = false;
  const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json } },
    "next-auth": { getServerSession: async () => ({ user: { id: "fixture-admin", role: "ADMIN" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => denied ? json({ error: "FORBIDDEN" }, { status: 403 }) : null },
    "@/lib/tracking/google-script-policy": policy,
    "@/lib/tracking/clarity-config": clarityPolicy,
    "@/lib/prisma-raw-command": { rawCommand: (value: unknown) => value },
    "@/lib/tracking/tracking-settings": { TRACKING_SETTINGS_COLLECTION: "TrackingSettings", getRawTrackingSettings: async () => stored },
    "@/lib/prisma": { prisma: { $runCommandRaw: async (command: Record<string, unknown>) => {
      commands.push(command);
      const updates = command.updates as Array<{ u: { $set: Record<string, unknown> } }>;
      stored = { ...stored, ...updates[0].u.$set };
    } } },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({ actorId: "fixture-admin" }), writeAuditLog: async (audit: unknown) => { audits.push(audit); } },
    "@/lib/integration-settings/crypto": { encryptIntegrationSecret: () => { throw new Error("unexpected secret mutation"); }, integrationEncryptionKeyIsConfigured: () => true },
    "@/lib/marketing/ga4-reporting": { parseGa4ServiceAccountJson: () => null },
  };
  const loaded = { exports: {} as { PUT: (request: { json: () => Promise<unknown> }) => Promise<Response>; GET: () => Promise<Response> } };
  const code = ts.transpileModule(fs.readFileSync("app/api/admin/tracking/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ module: loaded, exports: loaded.exports, console, Date, Object, JSON, require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; } });
  return { api: loaded.exports, commands, audits, deny: () => { denied = true; }, put: (body: unknown) => loaded.exports.PUT({ json: async () => body }) };
}

test("the tracking API rejects invalid GTM settings before writes or auditing", async () => {
  for (const body of [{ googleTagManagerEnabled: "false" }, { googleTagManagerEnabled: true }, { googleTagManagerEnabled: true, googleTagManagerId: "https://other.example/script.js" }, { googleTagManagerId: "GTM-ABC&extra=1" }]) {
    const f = fixture();
    const response = await f.put(body);
    assert.equal(response.status, 400);
    assert.equal(f.commands.length, 0);
    assert.equal(f.audits.length, 0);
  }
});

test("an authorized operator saves, reloads and disables a normalized container without changing existing tags or exposing secrets", async () => {
  const f = fixture();
  const response = await f.put({ googleTagManagerEnabled: true, googleTagManagerId: " gtm-fixture " });
  assert.equal(response.status, 200);
  const loaded = await (await f.api.GET()).json();
  assert.equal(loaded.googleTagManagerId, "GTM-FIXTURE");
  assert.equal(loaded.googleTagManagerEnabled, true);
  assert.equal(loaded.gaMeasurementId, "G-FIXTURE");
  assert.equal(loaded.gaApiSecretPresent, true);
  assert.ok(!JSON.stringify(loaded).includes("private-fixture-secret"));
  assert.ok(!JSON.stringify(f.audits).includes("private-fixture-secret"));
  const disabled = await f.put({ googleTagManagerEnabled: false, googleTagManagerId: null });
  assert.equal(disabled.status, 200);
  assert.equal((await disabled.json()).googleTagManagerEnabled, false);
  assert.equal(f.commands.length, 2);
  assert.equal(f.audits.length, 2);
});

test("a caller without tracking management permission cannot write settings", async () => {
  const f = fixture(); f.deny();
  assert.equal((await f.put({ googleTagManagerEnabled: true, googleTagManagerId: "GTM-FIXTURE" })).status, 403);
  assert.equal(f.commands.length, 0);
  assert.equal(f.audits.length, 0);
});


test("Clarity ID rejects scripts and malformed values before any writes", async () => {
  for (const body of [
    { clarityProjectId: "<script>alert(1)</script>" },
    { clarityProjectId: "https://clarity.microsoft.com/" },
    { clarityProjectId: "aa bbb.cc" },
    { clarityProjectId: "abc" },
    { clarityEnabled: "true" },
    { clarityEnabled: true, clarityProjectId: null },
  ]) {
    const f = fixture();
    const res = await f.put(body);
    assert.equal(res.status, 400);
    assert.equal(f.commands.length, 0);
    assert.equal(f.audits.length, 0);
  }
});

test("Clarity persists a normalized ID, reloads with existing GA4 untouched, then disables", async () => {
  const f = fixture();
  const response = await f.put({ clarityProjectId: " U60R8ZHRZH ", clarityEnabled: true });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.clarityProjectId, "u60r8zhrzh");
  assert.equal(saved.clarityEnabled, true);
  assert.equal(saved.claritySource, "saved");
  assert.equal(saved.clarityExternalVerifiedAt, null);
  const loaded = await (await f.api.GET()).json();
  assert.equal(loaded.clarityProjectId, "u60r8zhrzh");
  assert.equal(loaded.gaMeasurementId, "G-FIXTURE");
  assert.equal(loaded.gaApiSecretPresent, true);
  assert.ok(!JSON.stringify(loaded).includes("private-fixture-secret"));
  const off = await f.put({ clarityEnabled: false });
  assert.equal(off.status, 200);
  const disabled = await (await f.api.GET()).json();
  assert.equal(disabled.clarityEnabled, false);
  assert.equal(disabled.claritySource, "disabled");
  assert.equal(f.commands.length, 2);
  assert.equal(f.audits.length, 2);
  assert.ok(f.audits.every(audit => !JSON.stringify(audit).includes("private-fixture-secret")));
});

test("Clarity settings reject unauthorized mutations but remain readable only through allowed access", async () => {
  const f = fixture(); f.deny();
  assert.equal((await f.put({ clarityEnabled: false })).status, 403);
  assert.equal((await f.api.GET()).status, 403);
  assert.equal(f.commands.length, 0);
});
