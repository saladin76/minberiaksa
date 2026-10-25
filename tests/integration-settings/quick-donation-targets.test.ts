import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { DEFAULT_QUICK_DONATION, parseQuickDonation, quickDonationCampaignId, validateQuickDonationBody } from "../../lib/minbar/quick-donation";
const id = "507f1f77bcf86cd799439011";
const config = { ...DEFAULT_QUICK_DONATION, genericDestinations: ["where-needed"] as const, genericProjectIds: { "where-needed": id } };

test("unmapped general intentions never become payable and valid mappings survive parsing", () => {
  assert.equal(quickDonationCampaignId(parseQuickDonation(null), "where-needed"), null);
  const parsed = validateQuickDonationBody(config);
  assert.equal(quickDonationCampaignId(parsed, "where-needed"), id);
  assert.throws(() => validateQuickDonationBody({ ...config, genericProjectIds: {} }), /اربط/);
  assert.equal(quickDonationCampaignId({ ...parsed, projectsMode: "none" }, id), null);
  assert.equal(quickDonationCampaignId({ ...parsed, projectsMode: "selected", projectIds: [] }, id), null);
  assert.equal(quickDonationCampaignId(parsed, "zakat"), null);
});

function resolver(active: boolean, stored: unknown = config) {
  const queried: {where: {id: string; isActive: boolean; AND: unknown[]}}[] = [];
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (data: unknown, init?: { status?: number }) => ({data, status: init?.status ?? 200}) } },
    "@/lib/prisma": { prisma: { globalSettings: { findFirst: async () => ({ quickDonation: stored }) }, campaign: { findFirst: async (query: unknown) => { queried.push(query as typeof queried[number]); return active ? { id } : null; } } } },
    "@/lib/campaign/soft-delete-filter": { NOT_SOFT_DELETED: { OR: [{isDeleted: false}] } },
    "@/lib/minbar/quick-donation": { parseQuickDonation, quickDonationCampaignId },
  };
  const loaded = { exports: {} as {POST: (request: unknown) => Promise<{status: number; data: {projectId?: string}}>} };
  const code = ts.transpileModule(fs.readFileSync("app/api/quick-donation/resolve/route.ts", "utf8"), { compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022} }).outputText;
  new vm.Script(code).runInNewContext({ module: loaded, exports: loaded.exports, require: (name: string) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; } });
  return { queried, resolve: (destination: string) => loaded.exports.POST({json: async () => ({destination})}) };
}

test("destination resolution rechecks the active undeleted campaign before creating a cart row", async () => {
  const h = resolver(true); const response = await h.resolve("where-needed");
  assert.equal(response.status, 200); assert.equal(response.data.projectId, id);
  assert.equal(h.queried[0].where.isActive, true); assert.equal(h.queried[0].where.id, id);
  assert.ok(h.queried[0].where.AND.length);
  assert.equal((await resolver(false).resolve("where-needed")).status, 422);
  const unapproved = resolver(true, { ...config, genericProjectIds: {} });
  assert.equal((await unapproved.resolve("where-needed")).status, 422); assert.equal(unapproved.queried.length, 0);
});
