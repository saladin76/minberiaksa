import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as registry from "../../lib/bank-transfers/bank-registry";
import { normalizeEmailAssets } from "../../lib/templates/email-assets";
import { applyAppFont, APP_FONT_GOOGLE_LINK } from "../../lib/templates/font";

test("opening bank-transfer bank lists never creates or updates donation bank accounts", async () => {
  const commands: Record<string, unknown>[] = [];
  const legacy = { _id: { $oid: "507f1f77bcf86cd799439011" }, code: "ALBARAKA", nameAr: "بنك البركة" };
  const source = ts.transpileModule(fs.readFileSync("app/api/admin/bank-transfers/banks/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const isolated = { exports: {} as { GET?: () => Promise<{ banks: { id: string }[] }> } };
  const deps: Record<string, unknown> = {
    "@/lib/bank-transfers/bank-registry": registry,
    "next/server": { NextResponse: { json: (value: unknown) => value } },
    "next-auth": { getServerSession: async () => ({}) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => null },
    "@/lib/audit-log": {},
    "@/lib/prisma": { prisma: { $runCommandRaw: async (command: Record<string, unknown>) => {
      commands.push(command);
      assert.ok(command.find || command.aggregate, "GET must remain read-only");
      return { cursor: { firstBatch: command.find === "BankAccount" ? [legacy] : [] } };
    } } },
  };
  new vm.Script(source).runInNewContext({ module: isolated, exports: isolated.exports, require: (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; } });
  for (let i = 0; i < 2; i++) assert.equal((await isolated.exports.GET!()).banks[0].id, legacy._id.$oid);
  assert.ok(commands.some(command => command.find === "BankTransferBank"));
  assert.ok(commands.filter(command => command.find === "BankAccount").every(command => command.filter));
  assert.equal(registry.isLegacyTransferBank(legacy), true);
  assert.equal(registry.isLegacyTransferBank({ ...legacy, name: "Published bank", slug: "bank", holder: "Foundation" }), false);
  assert.equal(registry.isLegacyTransferBank({ _id: legacy._id }), false, "genuinely incomplete account rows stay repairable");
});

test("email delivery replaces embedded institution logos and makes relative image/CTA paths public", () => {
  const result = normalizeEmailAssets('<img alt="مؤسسة منبر الأقصى الدولية" src="data:image/png;base64,ZmFrZQ=="><img alt="Project" src="/photos/project.png"><a href="/ar/donation-failed?t=secret">Retry</a>');
  assert.ok(result.includes('src="https://minberiaksa.org/minbar/assets/logo-horizontal.png"'));
  assert.ok(result.includes('src="https://minberiaksa.org/photos/project.png"'));
  assert.ok(result.includes('href="https://minberiaksa.org/ar/donation-failed?t=secret"'));
  assert.equal(result.includes("base64"), false);
  assert.equal(normalizeEmailAssets('<img alt="Project" src="data:image/png;base64,ZmFrZQ==">'), '<img alt="Project" src="data:image/png;base64,ZmFrZQ==">');
});

test("Arabic delivery uses Cairo with valid escaped CSS and preserves unrelated styles", () => {
  const input = '<html><head></head><body style="font-family:&quot;Arial&quot;,sans-serif;color:#111"><p style="font-family:Tahoma;font-size:16px">مرحبا</p></body></html>';
  const result = applyAppFont(input, "ar");
  assert.equal((result.match(/font-family:&quot;Cairo&quot;, Tahoma, Arial, sans-serif/g) ?? []).length, 2);
  assert.ok(result.includes("color:#111"));
  assert.ok(result.includes("font-size:16px"));
  assert.ok(result.includes(APP_FONT_GOOGLE_LINK));
  assert.equal(applyAppFont(result, "ar"), result, "re-rendering is idempotent");
  assert.ok(applyAppFont(input, "en").includes("font-family:&quot;Arial&quot;,sans-serif"));
});
