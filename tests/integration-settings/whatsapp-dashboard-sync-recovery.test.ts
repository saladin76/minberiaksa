import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as syncResult from "../../lib/communication/template-sync-result";
import * as timestamps from "../../lib/communication/template-sync-timestamps";

type Result = { status: number; body: { templateSync?: syncResult.TemplateSyncResult } };

function dashboard(permitted = true, withCatalogue = true) {
  let reads = 0;
  const summary = { ok: true, matchedTemplates: 13, variantsUpserted: 192, unmatchedNames: ["remote_only"] };
  const audits = [
    { action: "communication.whatsapp.templates.sync", createdAt: new Date("2026-10-27T19:00:00Z"), metadata: { ...summary, matchedTemplates: 1, unmatchedNames: ["other_local_family"] } },
    ...(withCatalogue ? [{ action: syncResult.WHATSAPP_CATALOGUE_SYNC_ACTION, createdAt: new Date("2026-10-27T18:00:00Z"), metadata: summary }] : []),
  ];
  const prisma = {
    communicationDelivery: { count: async () => 0, groupBy: async () => [], findMany: async () => [] },
    whatsappTemplate: { findMany: async () => [] },
    communicationSender: { findMany: async () => [] },
    auditLog: { findFirst: async ({ where }: { where: { action: string; entityType: string } }) => {
      reads++;
      assert.equal(where.entityType, "WhatsappTemplate");
      return audits.find(row => row.action === where.action) ?? null;
    } },
  };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: Result["body"], init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "admin" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/prisma": { prisma },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => permitted ? null : { status: 403, body: {} } },
    "@/lib/communication/whatsapp-delivery-progress": { whatsappDeliveryProgress: () => { throw new Error("No delivery rows expected"); } },
    "@/lib/communication/runtime-config": { getActiveMetaWhatsappRuntimeConfig: async () => ({ configured: true }) },
    "@/lib/communication/delivery-retry-service": { retryPreflight: async () => ({ eligible: 0 }) },
    "@/lib/communication/whatsapp-template-sync": { resolveVariantForLocale: () => { throw new Error("No template rows expected"); } },
    "@/lib/communication/template-sync-result": syncResult,
    "@/lib/communication/template-sync-timestamps": timestamps,
    "@/lib/communication/purpose-group": { parseCommunicationPurposeGroup: () => "ALL", communicationPurposeWhere: () => ({}) },
  };
  const output = ts.transpileModule(fs.readFileSync("app/api/dashboard/communication/whatsapp/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as Record<string, unknown> };
  new vm.Script(output).runInNewContext({ module: loaded, exports: loaded.exports, Date, Map, Set, console, require: (id: string) => {
    if (!(id in deps)) throw new Error(`Unexpected dependency ${id}`);
    return deps[id];
  } });
  const get = loaded.exports.GET as (request: unknown) => Promise<Result>;
  return { get: () => get({ nextUrl: new URL("https://example.test/api/dashboard/communication/whatsapp") }), reads: () => reads };
}

test("dashboard recovery retains the completed catalogue when a newer single-template sync exists", async () => {
  const h = dashboard(); const result = await h.get();
  assert.equal(result.status, 200);
  assert.equal(result.body.templateSync?.matchedTemplates, 13);
  assert.equal(result.body.templateSync?.completedAt, "2026-10-27T18:00:00.000Z");
  assert.deepEqual(result.body.templateSync?.unmatchedNames, ["remote_only"]);
  assert.equal(h.reads(), 1);
});

test("legacy unscoped audits cannot establish a completed catalogue", async () => {
  assert.equal((await dashboard(true, false).get()).body.templateSync, null);
});

test("unauthorized dashboard requests cannot read the saved catalogue audit", async () => {
  const h = dashboard(false); assert.equal((await h.get()).status, 403); assert.equal(h.reads(), 0);
});
