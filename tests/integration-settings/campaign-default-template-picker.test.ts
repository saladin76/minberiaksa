import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { resolveTemplateKind } from "../../lib/communication/template-kind";
import { templateLocaleFromLanguage } from "../../lib/communication/template-locale-media";

function picker(mode: "normal" | "no-default" | "two-defaults" | "database-error" = "normal") {
  const source = readFileSync("lib/communication/template-compat.ts", "utf8");
  const modules: Record<string, unknown> = Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => [match[1], {}]));
  let reads = 0;
  const variant = (languageCode: string, businessAccountId = "default", approvalStatus = "APPROVED") => ({ languageCode, businessAccountId, approvalStatus, providerTemplateName: "provider_family", providerTemplateId: "provider-id", locale: "ar" });
  const candidates = [
    { id: "legacy", name: "Legacy approved", status: null, category: "MARKETING", kind: null, approvalStatus: "MISSING_IN_WABA", wabaVariants: [variant("en_US"), variant("tr", "ordinary"), variant("fr", "default", "PENDING")] },
    { id: "oldest", name: "Older campaign", category: "MARKETING", wabaVariants: [variant("nb")] },
    { id: "system", name: "Event", kind: "SYSTEM", wabaVariants: [variant("ar")] },
    { id: "bound", name: "Bound event", wabaVariants: [variant("ar")] },
    { id: "archived", name: "Archive", status: "ARCHIVED", wabaVariants: [variant("ar")] },
    { id: "other", name: "Only another account", wabaVariants: [variant("ar", "ordinary")] },
  ];
  Object.assign(modules, {
    "./template-kind": { resolveTemplateKind }, "./template-locale-media": { templateLocaleFromLanguage },
    "@/lib/locales": { DEFAULT_LOCALE: "ar", isValidLocale: (locale: string) => ["ar", "tr", "en", "fr", "no"].includes(locale) },
    "@/lib/prisma": { prisma: {
      messageTrigger: { findMany: async () => [{ templateId: "bound" }] },
      communicationSender: { findMany: async () => mode === "no-default" ? [] : mode === "two-defaults" ? [{ businessAccountId: "default" }, { businessAccountId: "other" }] : [{ businessAccountId: "default" }] },
      whatsappTemplate: { findMany: async (query: { where: { OR?: unknown[] }; select: { wabaVariants: { where: { businessAccountId: string; approvalStatus: string } } }; take?: number }) => {
        reads++; if (mode === "database-error") throw new Error("database unavailable");
        assert.ok(query.where.OR?.length, "legacy nullable/missing status must be included");
        assert.equal(query.take, undefined, "new automatic templates must not push older campaign templates out of a fixed cap");
        const filter = query.select.wabaVariants.where;
        return candidates.filter(row => row.status !== "ARCHIVED").map(row => ({ ...row, wabaVariants: row.wabaVariants.filter(v => v.businessAccountId === filter.businessAccountId && v.approvalStatus === filter.approvalStatus) }));
      } },
    } },
  });
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as { listChannelTemplates: (channel: string) => Promise<Array<{ id: string; availableLocales: string[] }>> } };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, process: { env: { DATABASE_URL: "fixture" } }, console: { error() {} }, require: (key: string) => { assert.ok(key in modules, key); return modules[key]; } });
  return { run: () => loaded.exports.listChannelTemplates("WHATSAPP"), reads: () => reads };
}
test("the default account's approved languages survive missing aggregate status and map the actual provider language", async () => {
  const rows = await picker().run();
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{ id: "legacy", name: "Legacy approved", availableLocales: ["en"] }, { id: "oldest", name: "Older campaign", availableLocales: ["no"] }]);
});
test("missing or ambiguous default routing never falls back to another number", async () => {
  for (const mode of ["no-default", "two-defaults"] as const) { const f = picker(mode); await assert.rejects(f.run(), /ONE_ACTIVE_DEFAULT/); assert.equal(f.reads(), 0); }
});
test("a failed template read propagates instead of masquerading as an empty approved catalogue", async () => {
  await assert.rejects(picker("database-error").run(), /database unavailable/);
});
