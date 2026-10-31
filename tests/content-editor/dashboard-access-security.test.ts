import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as policy from "../../lib/site-security/policy";
import { createHash } from "node:crypto";
import * as permissions from "../../lib/dashboard/permissions";
import * as apiAuth from "../../lib/dashboard/api-auth";
import * as legacyWrite from "../../lib/content-editor/legacy-write";
// Prisma-shaped fixtures exercise the real route; no production database is used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function load(file: string, dependencies: Row): Row {
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new vm.Script(source).runInNewContext({
    module: loaded,
    exports: loaded.exports,
    Date,
    URL,
    Headers,
    Error,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    console: { error() {} },
    process: { env: {} },
    require: (id: string) => {
      assert.ok(id in dependencies, id);
      return dependencies[id];
    },
  });
  return loaded.exports;
}
const json = {
  NextResponse: {
    json: (body: unknown, init: Row = {}) => ({
      body,
      status: init.status || 200,
    }),
  },
};
const rule = (extra: Partial<policy.AccessRule>): policy.AccessRule => ({
  id: "rule",
  kind: "IP",
  value: "203.0.113.0/24",
  action: "BLOCK",
  reason: "fixture",
  enabled: true,
  updatedAt: "2026-10-31T00:00:00Z",
  ...extra,
});
test("access policy normalizes valid IPv4/IPv6 and ignores forged provider headers", () => {
  assert.equal(policy.canonicalNetwork(" ::ffff:203.0.113.7 "), "203.0.113.7");
  assert.equal(
    policy.canonicalNetwork("2001:0db8:0000::1/64"),
    "2001:db8::1/64",
  );
  for (const input of [
    "1.2.3.999",
    "127.0.0.1/33",
    "::1/129",
    "fe80::1%eth0",
    "1.2.3.4/24/2",
  ])
    assert.equal(policy.canonicalNetwork(input), null, input);
  assert.equal(
    policy.securityClientIp(
      new Headers({
        "cf-connecting-ip": "203.0.113.8",
        "x-forwarded-for": "203.0.113.8",
      }),
    ),
    null,
  );
  assert.equal(
    policy.securityClientIp(
      new Headers({
        "x-real-ip": "203.0.113.7",
        "cf-connecting-ip": "203.0.113.8",
      }),
    ),
    "203.0.113.7",
  );
  assert.equal(policy.matchesNetwork("203.0.113.88", "203.0.113.0/24"), true);
  assert.equal(policy.matchesNetwork("2001:db8::8", "2001:db8::/64"), true);
  assert.equal(policy.matchesNetwork("203.0.114.8", "203.0.113.0/24"), false);
});
test("IP exceptions, country rules, expiry and recovery/payment paths use the same access semantics", () => {
  const blockedCountry = rule({ id: "country", kind: "COUNTRY", value: "TR" }),
    allowIp = rule({ id: "allow", value: "203.0.113.7", action: "ALLOW" });
  assert.equal(
    policy.accessDecision(
      [blockedCountry, rule({}), allowIp],
      "203.0.113.7",
      "TR",
    ).blocked,
    false,
  );
  assert.equal(
    policy.accessDecision([blockedCountry], "203.0.113.8", "TR").blocked,
    true,
  );
  assert.equal(
    policy.accessDecision([blockedCountry], "203.0.113.8", null).blocked,
    false,
  );
  assert.equal(
    policy.accessDecision(
      [rule({ expiresAt: "2020-01-01T00:00:00Z" })],
      "203.0.113.8",
      null,
    ).blocked,
    false,
  );
  assert.equal(
    policy.accessDecision(
      [rule({}), rule({ kind: "COUNTRY", value: "TR", action: "ALLOW" })],
      "203.0.113.8",
      "TR",
    ).blocked,
    true,
    "explicit IP block overrides country-wide allow",
  );
  for (const path of [
    "/dashboard/security",
    "/api/admin/site-security",
    "/auth/signin",
    "/api/albaraka/3d/callback",
    "/api/payfor/3dpay/ok",
    "/api/paypal/return",
    "/api/webhooks/paypal",
  ])
    assert.equal(policy.isSecurityExemptPath(path), true, path);
  for (const path of [
    "/ar",
    "/api/donations",
    "/api/payfor/initiate",
    "/api/albaraka/3d/initiate",
  ])
    assert.equal(policy.isSecurityExemptPath(path), false, path);
});
test("security administration rejects staff before reading IPs or writing rules", async () => {
  let calls = 0;
  const prisma = {
    $runCommandRaw: async () => {
      calls++;
      throw Error("not reached");
    },
  };
  const api = load("app/api/admin/site-security/route.ts", {
    "next/server": json,
    "next-auth": {
      getServerSession: async () => ({ user: { id: "staff", role: "STAFF" } }),
    },
    zod: { z },
    "node:crypto": { createHash },
    "libphonenumber-js": { getCountries: () => ["TR", "PS"] },
    "@/app/api/auth/[...nextauth]/options": {},
    "@/lib/dashboard/api-auth": apiAuth,
    "@/lib/prisma": { prisma },
    "@/lib/audit-log": {},
    "@/lib/site-security/policy": policy,
    "@/lib/site-security/store": {},
  });
  for (const method of ["GET", "POST", "DELETE"])
    assert.equal(
      (
        await api[method]({
          json: async () => assert.fail("must authorize first"),
        })
      ).status,
      403,
    );
  assert.equal(calls, 0);
});
function members(role = "ADMIN", live = 0, targetRole = "DONOR") {
  const writes: Row[] = [];
  const existing = {
    id: "target",
    name: "Fixture",
    email: "member@example.test",
    role: targetRole,
    updatedAt: new Date("2026-10-31T00:00:00Z"),
    dashboardPermissions: [],
  };
  const track = (name: string) => async (args: Row) => {
    writes.push({ name, ...args });
    return { count: 1 };
  };
  const prisma: Row = {
    user: {
      findUnique: async () => existing,
      findFirst: async () => null,
      updateMany: track("actorLock"),
      update: async (args: Row) => {
        writes.push({ name: "user", ...args });
        return { ...existing, ...args.data, password: "private-hash" };
      },
    },
    subscription: {
      count: async () => live,
      updateMany: track("subscription"),
    },
    donation: { count: async () => 3 },
  };
  for (const name of [
    "account",
    "session",
    "cartItem",
    "creditCard",
    "donorCommunicationProfile",
  ])
    prisma[name] = { deleteMany: track(name), updateMany: track(name) };
  prisma.$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn(prisma);
  const api = load("app/api/users/[id]/route.ts", {
    "next/server": json,
    "next-auth": {
      getServerSession: async () => ({
        user: {
          id: role === "SELF" ? "target" : "operator",
          role: role === "SELF" ? "ADMIN" : role,
        },
      }),
    },
    "../../auth/[...nextauth]/options": {},
    "@/lib/dashboard/permissions": permissions,
    "@/lib/dashboard/api-auth": apiAuth,
    "@/lib/audit-log": { writeAuditLog: async () => {} },
    "@/lib/badge-criteria": {},
    "@/lib/dashboard/donation-usd-revenue": {},
    "@/lib/dashboard/donor-account": {},
    "@/lib/communication/donor-communication-profile-service": {},
    "@/lib/prisma": { prisma },
  });
  const invoke = (method: string, body: Row = {}) =>
    api[method](
      { json: async () => body },
      { params: Promise.resolve({ id: "target" }) },
    );
  return { invoke, writes };
}
test("only administrators edit another member, and authority writes lock the administrator and compare the target revision", async () => {
  const staff = members("STAFF");
  assert.equal((await staff.invoke("PUT", { name: "Changed" })).status, 403);
  assert.equal(staff.writes.length, 0);
  assert.equal(
    (await members("SELF").invoke("PUT", { role: "DONOR" })).status,
    409,
  );
  const admin = members();
  const result = await admin.invoke("PUT", {
    name: "Changed",
    updatedAt: "2026-10-31T00:00:00Z",
    role: "STAFF",
    dashboardPermissions: ["campaigns"],
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.password, undefined);
  assert.equal(result.body.hasPassword, true);
  assert.equal(admin.writes[0].name, "actorLock");
  assert.equal(admin.writes[0].where.role, "ADMIN");
  assert.equal(
    admin.writes[1].where.updatedAt.toISOString(),
    "2026-10-31T00:00:00.000Z",
  );
  assert.equal(
    (await members().invoke("PUT", { updatedAt: "2020-01-01T00:00:00Z" }))
      .status,
    409,
  );
});
test("account deletion preserves financial history, disables contact and removes sign-in/card links, with live-plan and administrator guards", async () => {
  for (const h of [
    members("STAFF"),
    members("SELF"),
    members("ADMIN", 1),
    members("ADMIN", 0, "ADMIN"),
  ]) {
    assert.ok((await h.invoke("DELETE")).status >= 400);
    assert.equal(h.writes.length, 0);
  }
  const h = members(),
    result = await h.invoke("DELETE");
  assert.equal(result.status, 200);
  assert.equal(result.body.donationsKept, 3);
  const identity = h.writes.find((item) => item.name === "user")!.data;
  assert.equal(identity.email.endsWith("@deleted.invalid"), true);
  assert.equal(identity.registeredAt, null);
  assert.equal(identity.password, null);
  assert.equal(
    h.writes.find((item) => item.name === "donorCommunicationProfile")!.data
      .doNotContact,
    true,
  );
  assert.equal(
    h.writes.find((item) => item.name === "subscription")!.data.paymentCardId,
    null,
  );
  assert.ok(
    !h.writes.some((item) =>
      ["donation", "donationItem", "subscriptionDelete"].includes(item.name),
    ),
  );
});
function categoryFixture(refs = 0, role = "ADMIN") {
  const writes: Row[] = [];
  const row = {
    id: "a".repeat(24),
    name: "Archived",
    isActive: false,
    editorVersion: "version",
    campaignIds: ["b".repeat(24)],
  };
  const prisma: Row = {
    category: {
      findUnique: async () => row,
      update: async (args: Row) =>
        writes.push({ model: "categoryUpdate", ...args }),
      delete: async (args: Row) =>
        writes.push({ model: "categoryDelete", ...args }),
    },
    campaign: {
      findMany: async (args: Row) => {
        assert.ok(!JSON.stringify(args.where).includes("isActive"));
        return [
          {
            id: "b".repeat(24),
            title: "Hidden",
            isActive: false,
            isDeleted: true,
            categoryIds: [row.id],
          },
        ];
      },
    },
    auditLog: { create: async () => {} },
    $runCommandRaw: async (args: Row) => {
      writes.push(args);
      return { ok: 1, nModified: 1 };
    },
  };
  for (const model of [
    "donationCategoryItem",
    "subscriptionCategoryItem",
    "superCategoryItem",
  ])
    prisma[model] = { count: async () => refs };
  prisma.$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn(prisma);
  const api = load("app/api/admin/categories/[id]/projects/route.ts", {
    "next/server": json,
    "next-auth": {
      getServerSession: async () => ({
        user: { id: "operator", role, dashboardPermissions: ["categories"] },
      }),
    },
    "@/app/api/auth/[...nextauth]/options": {},
    "@/lib/dashboard/api-auth": apiAuth,
    "@/lib/prisma": { prisma },
    "@/lib/content-editor/legacy-write": legacyWrite,
    "next/cache": { revalidatePath() {} },
  });
  return {
    writes,
    invoke: (method: string, extra: Row = {}) =>
      api[method](
        {
          json: async () => ({
            confirmation: "Archived",
            editorVersion: "version",
            ...extra,
          }),
        },
        { params: Promise.resolve({ id: row.id }) },
      ),
  };
}
test("archived category inspection includes hidden projects; detach-delete retains projects and refuses direct financial/page references", async () => {
  const h = categoryFixture(),
    read = await h.invoke("GET");
  assert.equal(read.body.projects[0].isDeleted, true);
  assert.equal(read.body.canDetachAndDelete, true);
  assert.equal((await h.invoke("DELETE")).status, 200);
  assert.equal(h.writes[0].update, "Campaign");
  assert.ok(h.writes[0].updates[0].u.$pull.categoryIds);
  assert.ok(!h.writes.some((item) => item.delete === "Campaign"));
  for (const blocked of [categoryFixture(1), categoryFixture(0, "STAFF")]) {
    assert.ok((await blocked.invoke("DELETE")).status >= 400);
    assert.equal(blocked.writes.length, 0);
  }
  const stale = categoryFixture();
  assert.equal(
    (await stale.invoke("DELETE", { editorVersion: "stale" })).status,
    409,
  );
  assert.equal(stale.writes.length, 0);
});

test("request enforcement blocks public APIs, preserves recovery callbacks and does not geolocate routine visits", async () => {
  const { NextRequest, NextResponse } = await import("next/server");
  let rules: policy.AccessRule[] = [],
    reads = 0,
    lookups = 0;
  const visits: Row[] = [],
    work: Promise<unknown>[] = [];
  const api = load("lib/site-security/request.ts", {
    "next/server": { NextResponse },
    "next-auth/jwt": { getToken: async () => ({ sub: "verified-member" }) },
    "./store": {
      accessRules: async () => {
        reads++;
        return rules;
      },
      recordSiteVisitor: async (value: Row) => {
        visits.push(value);
      },
    },
    "./policy": policy,
    "@/lib/geo/ip-lookup": {
      lookupIpGeo: async () => {
        lookups++;
        return { countryCode: "TR" };
      },
    },
  });
  const request = (path: string) =>
      new NextRequest("https://fixture.example" + path, {
        headers: { "x-real-ip": "203.0.113.7" },
      }),
    event = { waitUntil: (promise: Promise<unknown>) => work.push(promise) };
  assert.equal(
    await api.checkSiteAccess(request("/ar/bagislar/" + "a".repeat(24)), event),
    null,
  );
  await Promise.all(work);
  assert.equal(lookups, 0);
  assert.equal(visits[0].userId, "verified-member");
  assert.equal(visits[0].path, "/ar/bagislar/:id");
  rules = [rule({})];
  assert.equal(
    (await api.checkSiteAccess(request("/api/donations"), event)).status,
    403,
  );
  const before = reads;
  assert.equal(
    await api.checkSiteAccess(request("/api/payfor/3dpay/ok"), event),
    null,
  );
  assert.equal(reads, before);
  assert.equal(lookups, 0);
  rules = [rule({ kind: "COUNTRY", value: "TR" })];
  const blocked = await Promise.all([
    api.checkSiteAccess(request("/api/donations"), event),
    api.checkSiteAccess(request("/api/donations"), event),
  ]);
  assert.ok(blocked.every((response) => response.status === 403));
  assert.equal(lookups, 1, "concurrent country checks share one lookup");
});

test("administrator access rules validate addresses and countries and disable rules with a revision check instead of deleting them", async () => {
  const commands: Row[] = [];
  let matched = 0,
    clears = 0;
  const api = load("app/api/admin/site-security/route.ts", {
    "next/server": json,
    "next-auth": {
      getServerSession: async () => ({
        user: { id: "operator", role: "ADMIN" },
      }),
    },
    zod: { z },
    "node:crypto": { createHash },
    "libphonenumber-js": { getCountries: () => ["TR", "PS"] },
    "@/app/api/auth/[...nextauth]/options": {},
    "@/lib/dashboard/api-auth": apiAuth,
    "@/lib/prisma": {
      prisma: {
        $runCommandRaw: async (command: Row) => {
          commands.push(command);
          return { ok: 1, n: matched };
        },
      },
    },
    "@/lib/audit-log": {
      queueAuditLog() {},
      auditActorFromDashboardSession: () => ({ actorId: "operator" }),
    },
    "@/lib/site-security/policy": policy,
    "@/lib/site-security/store": {
      RULES_COLLECTION: "SiteAccessRule",
      clearAccessRulesCache: () => clears++,
    },
  });
  const request = (body: Row) => ({ json: async () => body }),
    base = {
      kind: "IP",
      value: "203.0.113.7",
      action: "BLOCK",
      reason: "Fixture protection",
      expiresInHours: 24,
    };
  for (const body of [
    { ...base, value: "203.0.113.7/33" },
    { ...base, kind: "COUNTRY", value: "ZZ" },
    { ...base, reason: "" },
  ])
    assert.equal((await api.POST(request(body))).status, 400);
  assert.equal(commands.length, 0);
  assert.equal((await api.POST(request(base))).status, 200);
  assert.equal(commands[0].updates[0].u.$set.value, "203.0.113.7");
  assert.equal(commands[0].updates[0].u.$set.enabled, true);
  assert.equal(clears, 1);
  assert.equal((await api.POST(request({ ...base, kind: "COUNTRY", value: "tr" }))).status, 200);
  assert.equal(commands[1].updates[0].u.$set.value, "TR");
  assert.equal(clears, 2);
  const body = { id: "a".repeat(64), updatedAt: "2026-10-31T00:00:00.000Z" };
  assert.equal((await api.DELETE(request(body))).status, 409);
  assert.equal(clears, 2);
  matched = 1;
  assert.equal((await api.DELETE(request(body))).status, 200);
  assert.equal(commands.at(-1)!.updates[0].u.$set.enabled, false);
  assert.equal(commands.at(-1)!.updates[0].q.updatedAt.$date, body.updatedAt);
  assert.equal(clears, 3);
  assert.equal(
    policy.securityClientIp(new Headers({ "x-real-ip": "fe80::1%eth0" })),
    null,
  );
  assert.equal(
    policy.securityClientIp(new Headers({ "x-real-ip": "::ffff:cb00:7107" })),
    "::ffff:cb00:7107",
  );
});
