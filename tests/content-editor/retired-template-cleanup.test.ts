import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { retiredTemplateDisposition } from "../../lib/communication/retired-template-policy";

async function cleanup(apply: boolean, failRead = false) {
  const rows = [{ id: "unused", status: "ARCHIVED" }, { id: "historical", status: "READY" }, { id: "bound", status: "ARCHIVED" }];
  const changes: string[] = [], backups: string[] = [], reports: string[] = [];
  const templates = {
    findMany: async (args: { where: { name?: unknown } }) => args.where.name ? [{ notificationUpgrade: { activatedAt: "today", sourceId: "historical" } }] : rows,
    findUnique: async (args: { where: { id: string } }) => rows.find(row => row.id === args.where.id),
    delete: async (args: { where: { id: string } }) => { assert.ok(backups.some(value => value.includes(args.where.id)), "backup must precede deletion"); changes.push(`DELETE:${args.where.id}`); },
    update: async (args: { where: { id: string }; data: { status: string } }) => { assert.equal(args.data.status, "ARCHIVED"); changes.push(`ARCHIVE:${args.where.id}`); },
  };
  const zero = { count: async () => 0 };
  let disconnected = false;
  const prisma = {
    whatsappTemplate: templates, emailTemplate: { findMany: async () => [] },
    messageTrigger: { count: async (args: { where: { templateId: string } }) => args.where.templateId === "bound" ? 1 : 0 },
    communicationCampaign: zero,
    communicationDelivery: { count: async (args: { where: { templateId: string } }) => { if (failRead) throw new Error("DB_READ_FAILED"); return args.where.templateId === "historical" ? 1 : 0; } },
    sentMessage: zero, marketingCampaignSnapshot: zero, communicationCampaignTrackingLink: zero,
    whatsappTemplateWabaVariant: { findMany: async () => [] }, whatsappTemplateVariant: { findMany: async () => [] },
    $transaction: async (run: (tx: unknown) => Promise<void>) => run(prisma), $disconnect: async () => { disconnected = true; },
  };
  const code = readFileSync("scripts/cleanup-retired-templates.mjs", "utf8").replace(/^import .*;\n/gm, "").replace(/import\.meta\.url/g, '"file:///fixture/script.mjs"');
  const promise = new vm.Script(`(async()=>{${code}})()`).runInNewContext({
    process: { argv: apply ? ["node", "script", "--apply"] : ["node", "script"], env: {}, cwd: () => "/fixture/app" },
    createRequire: () => () => ({ loadEnvConfig() {} }), ...path,
    mkdir: async () => {}, appendFile: async (_file: string, data: string, opts: { mode: number }) => { assert.equal(opts.mode, 0o600); backups.push(data); },
    loadReleaseModule: async (name: string) => name.includes("prisma") ? { prisma } : { retiredTemplateDisposition },
    console: { log: (value: string) => reports.push(value) },
  });
  if (failRead) await assert.rejects(promise, /DB_READ_FAILED/); else await promise;
  assert.ok(disconnected);
  return { changes, backups, report: reports.length ? JSON.parse(reports[0]) : null };
}
test("retired-template dry run reads references without writes, backups or provider calls", async () => {
  const result = await cleanup(false);
  assert.deepEqual(result.changes, []); assert.deepEqual(result.backups, []);
  assert.equal(result.report.readOnly, true); assert.equal(result.report.providerCalls, 0);
  assert.deepEqual(result.report.results.map((row: { disposition: string }) => row.disposition), ["DELETE", "ARCHIVE", "KEEP"]);
});
test("cleanup backs up unused templates, retains history and never removes a trigger binding", async () => {
  const result = await cleanup(true);
  assert.deepEqual(result.changes, ["DELETE:unused", "ARCHIVE:historical"]);
  assert.equal(result.backups.length, 2); assert.equal(result.report.recipientMessages, 0);
});
test("a reference-read failure cannot be interpreted as an unused template", async () => {
  const result = await cleanup(true, true); assert.deepEqual(result.changes, []); assert.deepEqual(result.backups, []);
});
