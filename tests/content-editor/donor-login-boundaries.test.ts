import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Reply = { status: number; body: Record<string, unknown> };
const json = (body: Record<string, unknown>, options?: { status?: number }): Reply => ({ status: options?.status ?? 200, body });
function load<T>(path: string, imports: Record<string, unknown>): T {
  const fixtureModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: fixtureModule, exports: fixtureModule.exports, process, URL, Date, require: (name: string) => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; } });
  return fixtureModule.exports as T;
}
test("WhatsApp authentication uses an approved authentication template; archived content excludes codes", async () => {
  const archived: Record<string, unknown>[] = [], statuses: string[] = [], sent: Record<string, unknown>[] = [];
  const make = (approved: boolean) => load<typeof import("../../lib/auth/donor-login-delivery")>("lib/auth/donor-login-delivery.ts", {
    "@/lib/communication/providers/email/client": { sendEmailMessage: async () => ({ ok: true, providerMessageId: "email-1" }) },
    "@/lib/communication/runtime-config": { getActiveElasticEmailRuntimeConfig: async () => ({}), getActiveMetaWhatsappRuntimeConfig: async () => ({ configured: true, values: { defaultPhoneNumberId: "sender-1" } }) },
    "@/lib/communication/providers/meta-whatsapp/messages": { sendTemplateMessage: async (input: Record<string, unknown>) => { sent.push(input); return { ok: true, providerMessageId: "wamid-1" }; } },
    "@/lib/communication/providers/meta-whatsapp/templates": { listApprovedTemplates: async () => ({ ok: true, templates: approved ? [{ name: "mia_donor_login_v1", language: "ar", category: "AUTHENTICATION", status: "APPROVED" }] : [] }) },
    "@/lib/communication/delivery-log-service": { createDeliveryRecord: async (input: Record<string, unknown>) => { archived.push(input); return { ok: true, data: { id: "delivery-1" } }; }, markDeliveryStatus: async (_id: string, status: string) => { statuses.push(status); } },
  });
  delete process.env.DONOR_LOGIN_WHATSAPP_TEMPLATE;
  delete process.env.DONOR_LOGIN_WHATSAPP_LANGUAGE;
  const input = { channel: "WHATSAPP" as const, contact: "+905527396876", code: "123456", locale: "ar" };
  await assert.rejects(make(false).deliverLoginCode(input), /DELIVERY_UNAVAILABLE/);
  assert.equal(sent.length, 0);
  await make(true).deliverLoginCode(input);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].components)), [{ type: "body", parameters: [{ type: "text", text: "123456" }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] }]);
  assert.ok(archived.every(r => !String(r.renderedBody).includes("123456")));
  assert.deepEqual(statuses, ["FAILED", "SENT"]);
  assert.ok(!statuses.includes("DELIVERED"));
});

test("public linking and administrator invitation routes reject unauthorized requests before sends", async () => {
  const responses = { "next/server": { NextResponse: { json } } };
  const boundary = load<typeof import("../../lib/auth/donor-login-request")>("lib/auth/donor-login-request.ts", responses);
  const request = { headers: new Headers({ origin: "https://minberiaksa.org", "content-type": "application/json" }), nextUrl: { origin: "https://minberiaksa.org" }, json: async () => ({ channel: "EMAIL", contact: "a@example.invalid", link: true }) };
  let calls = 0;
  const common = { ...responses, "next-auth": { getServerSession: async () => null }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/auth/donor-login-request": boundary, "@/lib/auth/donor-login-service": { requestDonorLogin: async () => { calls++; }, verifyDonorLogin: async () => { calls++; } }, "@/lib/locales": { isValidLocale: () => true } };
  const publicApi = load<Record<string, (r: unknown) => Promise<Reply>>>("app/api/auth/donor-code/route.ts", common);
  assert.equal((await publicApi.POST(request)).status, 401);
  assert.equal((await publicApi.PATCH(request)).status, 401);
  const invites = load<Record<string, (r: unknown, context: unknown) => Promise<Reply>>>("app/api/users/[id]/account-invitation/route.ts", {
    ...common, "@/lib/prisma": { prisma: {} }, "@/lib/audit-log": { writeAuditLog: async () => {} }, "@/lib/dashboard/api-auth": { requireAdminSession: () => json({ error: "Unauthorized" }, { status: 401 }) },
  });
  assert.equal((await invites.POST(request, { params: Promise.resolve({ id: "a".repeat(24) }) })).status, 401);
  assert.equal(calls, 0);
  const foreign = { ...request, headers: new Headers({ origin: "https://foreign.invalid", "content-type": "application/json" }) };
  assert.equal((await publicApi.POST(foreign)).status, 403);
});

test("closed accounts remove verified credentials and ordinary profile edits cannot replace login email", () => {
  const source = fs.readFileSync("app/api/users/[id]/route.ts", "utf8");
  assert.ok(source.includes('tx.donorLoginIdentity.deleteMany({ where: { userId: id } })'));
  assert.ok(source.includes('error: "VERIFY_EMAIL_IN_LINKED_IDENTITIES"'));
  const auth = fs.readFileSync("app/api/auth/[...nextauth]/options.ts", "utf8");
  assert.ok(auth.includes("dbUser.mergedIntoUserId"));
  assert.ok(auth.includes('email_verified !== true'));
});
