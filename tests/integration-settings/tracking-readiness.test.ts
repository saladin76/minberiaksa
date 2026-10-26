import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function fixture({ allowed = true, saved = {} as Record<string, unknown> } = {}) {
  const audits: Array<Record<string, unknown>> = [];
  let reads = 0;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { role: "ADMIN" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_session: unknown, permission: string) => { assert.equal(permission, "platformConnectionsTest"); return allowed ? null : { status: 403 }; } },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({}), writeAuditLog: async (row: Record<string, unknown>) => { audits.push(row); } },
    "@/lib/tracking/meta-capi": { sendMetaCapiEvent: () => { throw new Error("Readiness must not contact a provider"); } },
    "@/lib/tracking/tracking-settings": {
      getRawTrackingSettings: async () => { reads++; return saved; },
      trackingString: (row: Record<string, unknown>, key: string) => typeof row[key] === "string" && row[key].trim() ? row[key].trim() : null,
      trackingBoolean: (row: Record<string, unknown>, key: string) => row[key] === true,
    },
  };
  type Reply = { status: number; body: { ok: boolean; status: string; validationOnly?: boolean; testEventSent?: boolean; missingFields?: string[] } };
  const loaded = { exports: {} as { POST(request: unknown): Promise<Reply> } };
  const code = ts.transpileModule(readFileSync("app/api/admin/tracking/test/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ exports: loaded.exports, module: loaded, Date, fetch() { throw new Error("Readiness must not contact a provider"); }, require(name: string) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { audits, reads: () => reads, post: (body: unknown) => loaded.exports.POST({ json: async () => body }) };
}

test("tracking readiness requires test permission before reading saved credentials", async () => {
  const f = fixture({ allowed: false });
  assert.equal((await f.post({ platform: "google_ads" })).status, 403);
  assert.equal(f.reads(), 0);
  assert.equal(f.audits.length, 0);
});

test("Google Ads readiness checks saved values and explicitly reports no event was sent", async () => {
  const f = fixture({ saved: { googleAdsConversionId: "AW-123456789", googleAdsConversionLabel: "fixture_label" } });
  const reply = await f.post({ platform: "google_ads" });
  assert.equal(reply.status, 200);
  assert.equal(reply.body.ok, true);
  assert.equal(reply.body.status, "ready");
  assert.equal(reply.body.validationOnly, true);
  assert.equal(reply.body.testEventSent, false);
  assert.equal(f.audits.length, 1);
  assert.doesNotMatch(JSON.stringify(f.audits), /AW-123456789|fixture_label/);
});

test("unsaved request values cannot override persisted tracking credentials", async () => {
  const f = fixture();
  const reply = await f.post({ platform: "google_ads", googleAdsConversionId: "AW-123456789", googleAdsConversionLabel: "draft" });
  assert.equal(reply.body.status, "missing_config");
  assert.equal(JSON.stringify(reply.body.missingFields), JSON.stringify(["googleAdsConversionId", "googleAdsConversionLabel"]));
});

test("non-sending readiness for TikTok and X succeeds without pretending an external test happened", async () => {
  for (const [platform, saved] of [
    ["tiktok", { tiktokPixelId: "fixture", tiktokAccessToken: "private_fixture" }],
    ["x", { xPixelId: "fixture", xAccessToken: "private_fixture", xAdAccountId: "fixture" }],
  ] as const) {
    const f = fixture({ saved });
    const reply = await f.post({ platform });
    assert.equal(reply.body.status, "ready");
    assert.equal(reply.body.testEventSent, false);
    assert.doesNotMatch(JSON.stringify(reply), /private_fixture/);
  }
});
