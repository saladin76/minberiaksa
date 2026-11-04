import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as policy from "../../lib/auth/donor-login-policy";
import { phoneMatchVariants } from "../../lib/communication/phone";

type Row = Record<string, unknown>;
type Input = { where?: Row; data?: Row; create?: Row; update?: Row; orderBy?: Row; take?: number };
type Service = typeof import("../../lib/auth/donor-login-service");
const proof = { channel: "EMAIL" as const, contact: "donor@example.invalid", locale: "ar", requestKey: "test-client" };
process.env.NEXTAUTH_SECRET = "synthetic-test-secret-only";

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Row[]).some(w => matches(row, w));
    if (key === "AND") return (value as Row[]).every(w => matches(row, w));
    const actual = row[key];
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const cond = value as Row;
      return Object.entries(cond).every(([op, expected]) => {
        if (op === "mode") return true;
        if (op === "equals") return cond.mode === "insensitive" ? String(actual).toLowerCase() === String(expected).toLowerCase() : actual === expected;
        if (op === "in") return (expected as unknown[]).includes(actual);
        if (op === "not") return actual != null && actual !== expected;
        if (op === "isSet") return (actual !== undefined) === expected;
        const a = actual instanceof Date ? actual.getTime() : Number(actual);
        const b = expected instanceof Date ? expected.getTime() : Number(expected);
        return op === "lt" ? a < b : op === "lte" ? a <= b : op === "gt" ? a > b : op === "gte" ? a >= b : false;
      });
    }
    return value === null ? actual === null : actual === value;
  });
}
function fixture(seed: Row[] = [], deliveryFailure = false) {
  let db: Record<string, Row[]> = { user: structuredClone(seed) };
  let serial = 0;
  const sent: Array<{ code: string; contact: string }> = [];
  const delegate = (name: string) => {
    const rows = () => db[name] ??= [];
    const update = (row: Row, data: Row = {}) => {
      for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? Number(row[key] ?? 0) + Number((value as Row).increment) : value;
      return structuredClone(row);
    };
    const find = (where: Row = {}) => rows().find(r => matches(r, where));
    return {
      findUnique: async (arg: Input) => structuredClone(find(arg.where) ?? null),
      findUniqueOrThrow: async (arg: Input) => { const r = find(arg.where); if (!r) throw Error("missing fixture row"); return structuredClone(r); },
      findFirst: async (arg: Input) => structuredClone(rows().filter(r => matches(r, arg.where)).sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] ?? null),
      findMany: async (arg: Input) => structuredClone(rows().filter(r => matches(r, arg.where)).slice(0, arg.take || 100)),
      count: async (arg: Input) => rows().filter(r => matches(r, arg.where)).length,
      create: async (arg: Input) => {
        if (find({ id: arg.data?.id }) && arg.data?.id) throw Object.assign(Error("unique"), { code: "P2002" });
        const r = { id: `synthetic-${++serial}`, attempts: name === "donorLoginThrottle" ? 1 : 0, consumed: false, sent: false, linkUserId: null, invitationUserId: null, email: null, password: null, emailVerified: null, registeredAt: null, accounts: [], createdAt: new Date(), ...arg.data };
        rows().push(r); return structuredClone(r);
      },
      update: async (arg: Input) => { const r = find(arg.where); if (!r) throw Error("missing fixture row"); return update(r, arg.data); },
      updateMany: async (arg: Input) => { const found = rows().filter(r => matches(r, arg.where)); found.forEach(r => update(r, arg.data)); return { count: found.length }; },
      deleteMany: async (arg: Input) => { const found = rows().filter(r => matches(r, arg.where)); db[name] = rows().filter(r => !matches(r, arg.where)); return { count: found.length }; },
      upsert: async (arg: Input) => { const r = find(arg.where); if (r) return update(r, arg.update); const created = { ...arg.create }; rows().push(created); return structuredClone(created); },
    };
  };
  const prisma: Record<string, unknown> = {};
  for (const name of ["user", "donorLoginIdentity", "donorLoginChallenge", "donorLoginThrottle", "donorAccountInvitation", "donation", "subscription", "subscriptionServiceRequest", "subscriptionCardVerification", "certificate", "creditCard", "account", "session", "auditLog", "donorCommunicationProfile"]) prisma[name] = delegate(name);
  let queue = Promise.resolve();
  prisma.$transaction = async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
    const before = queue;
    let unlock = () => {};
    queue = new Promise<void>(resolve => { unlock = resolve; });
    await before;
    const snapshot = structuredClone(db);
    try { return await callback(prisma); } catch (error) { db = snapshot; throw error; } finally { unlock(); }
  };
  const serviceModule = { exports: {} as Service };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/auth/donor-login-service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: serviceModule, exports: serviceModule.exports, Date, Set, process,
    require: (name: string) => {
      if (name === "@/lib/prisma") return { prisma };
      if (name === "./donor-login-policy") return policy;
      if (name === "@/lib/communication/phone") return { phoneMatchVariants };
      if (name === "./donor-login-delivery") return { deliverLoginCode: async (input: { code: string; contact: string }) => { if (deliveryFailure) throw Error("provider offline"); sent.push(input); return { deliveryId: "delivery-1", providerMessageId: "wamid.synthetic" }; } };
      throw Error(`Unexpected import ${name}`);
    }, URL,
  });
  return { service: serviceModule.exports, sent, rows: (name: string) => db[name] ??= [] };
}
function donor(id: string, extra: Row = {}): Row {
  return { id, role: "DONOR", email: "donor@example.invalid", password: null, emailVerified: null, registeredAt: null, accounts: [], mergedIntoUserId: null, ...extra };
}

test("email and international phone normalization retain provider-independent identity", () => {
  assert.equal(policy.loginContact("EMAIL", " A@Hotmail.com "), "a@hotmail.com");
  assert.equal(policy.loginContact("WHATSAPP", "00905527396876"), "+905527396876");
  assert.throws(() => policy.loginContact("WHATSAPP", "05527396876"));
  assert.notEqual(policy.identityKey("EMAIL", "a@example.invalid"), policy.identityKey("WHATSAPP", "+905527396876"));
});
test("codes are hashed, delivery precedes usability, and replay/concurrent replay fails", async () => {
  const f = fixture();
  const issued = await f.service.requestDonorLogin(proof);
  const code = f.sent[0].code;
  assert.notEqual(f.rows("donorLoginChallenge")[0].codeHash, code);
  assert.equal(f.rows("donorLoginChallenge")[0].sent, true);
  const outcomes = await Promise.allSettled([f.service.verifyDonorLogin({ ...issued, code }), f.service.verifyDonorLogin({ ...issued, code })]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.rows("user").length, 1);
  await assert.rejects(f.service.verifyDonorLogin({ ...issued, code }), /INVALID_CODE/);
});
test("five wrong codes, expiry and ticket/session mismatches cannot authenticate", async () => {
  const f = fixture();
  const issued = await f.service.requestDonorLogin(proof);
  const code = f.sent[0].code;
  for (let i = 0; i < 5; i++) await assert.rejects(f.service.verifyDonorLogin({ ...issued, code: code === "000000" ? "111111" : "000000" }), /INVALID_CODE/);
  await assert.rejects(f.service.verifyDonorLogin({ ...issued, code }), /INVALID_CODE/);
  const expired = fixture(); const next = await expired.service.requestDonorLogin(proof);
  expired.rows("donorLoginChallenge")[0].expiresAt = new Date(0);
  await assert.rejects(expired.service.verifyDonorLogin({ ...next, code: expired.sent[0].code }), /INVALID_CODE/);
  const linked = fixture([donor("target")]);
  const ticket = await linked.service.requestDonorLogin({ ...proof, linkUserId: "target" });
  await assert.rejects(linked.service.verifyDonorLogin({ ...ticket, code: linked.sent[0].code }), /INVALID_CODE/);
  await assert.rejects(linked.service.verifyDonorLogin({ ...ticket, ticket: "f".repeat(64), code: linked.sent[0].code, linkUserId: "target" }), /INVALID_CODE/);
});
test("contact cooldown is atomic and cannot be bypassed by changing request client", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.service.requestDonorLogin(proof), f.service.requestDonorLogin({ ...proof, requestKey: "other-client" })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.sent.length, 1);
});
test("a verified second email merges donor history into the logged-in account transactionally", async () => {
  const f = fixture([donor("target", { email: "first@gmail.com", registeredAt: new Date() }), donor("source")]);
  f.rows("donation").push({ id: "paid", donorId: "source", amount: 30, status: "PAID" });
  f.rows("subscription").push({ id: "plan", donorId: "source", amount: 5, status: "ACTIVE" });
  const issued = await f.service.requestDonorLogin({ ...proof, linkUserId: "target" });
  const user = await f.service.verifyDonorLogin({ ...issued, code: f.sent[0].code, linkUserId: "target" });
  assert.equal(user.id, "target");
  assert.equal(f.rows("donation")[0].donorId, "target");
  assert.equal(f.rows("donation")[0].amount, 30);
  assert.equal(f.rows("donation")[0].originalDonorId, "source");
  assert.equal(f.rows("subscription")[0].donorId, "target");
  assert.equal(f.rows("subscription")[0].status, "ACTIVE");
  assert.equal(f.rows("subscription")[0].originalDonorId, "source");
  assert.equal(f.rows("donorLoginIdentity")[0].userId, "target");
  assert.equal(f.rows("user").find(u => u.id === "source")?.mergedOriginalEmail, proof.contact);
  assert.equal((await f.service.verifiedGoogleIdentity(proof.contact)).id, "target");
});
test("an unverified profile phone cannot take over an established account", async () => {
  const f = fixture([donor("registered", { phone: "+905527396876", registeredAt: new Date() })]);
  const issued = await f.service.requestDonorLogin({ ...proof, channel: "WHATSAPP", contact: "+905527396876" });
  await assert.rejects(f.service.verifyDonorLogin({ ...issued, code: f.sent[0].code }), /VERIFY_ACCOUNT_EMAIL_FIRST/);
  assert.equal(f.rows("donorLoginIdentity").length, 0);
});
test("phone proof unifies guests but never verifies their unproven email addresses", async () => {
  const f = fixture([donor("one", { email: "first@gmail.com", phone: "+905527396876" }), donor("two", { email: "other@hotmail.com", phone: "905527396876" })]);
  f.rows("donation").push({ id: "one-payment", donorId: "one" }, { id: "two-payment", donorId: "two" });
  const issued = await f.service.requestDonorLogin({ ...proof, channel: "WHATSAPP", contact: "+905527396876" });
  const user = await f.service.verifyDonorLogin({ ...issued, code: f.sent[0].code });
  assert.ok(f.rows("donation").every(d => d.donorId === user.id));
  assert.deepEqual(f.rows("donorLoginIdentity").map(i => i.channel), ["WHATSAPP"]);
});
test("privileged accounts and in-flight billing are never merged; failed delivery cannot authenticate", async () => {
  const privileged = fixture([donor("admin", { role: "ADMIN" })]);
  await assert.rejects(privileged.service.verifiedGoogleIdentity(proof.contact), /ACCOUNT_CONFLICT/);
  const busy = fixture([donor("target", { email: "other@example.invalid" }), donor("source")]);
  busy.rows("subscription").push({ donorId: "source", billingLeaseUntil: new Date(Date.now() + 60_000) });
  const ticket = await busy.service.requestDonorLogin({ ...proof, linkUserId: "target" });
  await assert.rejects(busy.service.verifyDonorLogin({ ...ticket, code: busy.sent[0].code, linkUserId: "target" }), /ACCOUNT_CONFLICT/);
  assert.equal(busy.rows("user").find(u => u.id === "source")?.email, proof.contact);
  const failed = fixture([], true);
  await assert.rejects(failed.service.requestDonorLogin(proof), /DELIVERY_UNAVAILABLE/);
  assert.equal(failed.rows("donorLoginChallenge")[0].consumed, true);
  assert.equal(failed.rows("donorLoginChallenge")[0].sent, false);
});
test("an invited donor enters the existing account and activates the invitation once", async () => {
  const f = fixture([donor("invited")]);
  await f.service.requestDonorLogin({ ...proof, invitationUserId: "invited" });
  assert.equal(f.rows("user")[0].registeredAt, null);
  const user = await f.service.verifyDonorInvitation("EMAIL", proof.contact, f.sent[0].code);
  assert.equal(user.id, "invited");
  assert.equal(f.rows("donorAccountInvitation")[0].status, "ACTIVATED");
  await assert.rejects(f.service.verifyDonorInvitation("EMAIL", proof.contact, f.sent[0].code), /INVALID_CODE/);
});
