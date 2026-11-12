import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { donationListSafeFields } from "../../lib/dashboard/donation-list-privacy";
import { DONATION_TOKEN_PARAM, donationTokenMatches } from "../../lib/donations/access-token";

type Row = Record<string, unknown>;
const id = "a".repeat(24);
const bearer = "b".repeat(48);
const rotatedBearer = "c".repeat(48);

function harness(options: {
  session?: { user: { id: string; role: string } } | null;
  missing?: boolean;
  rotateOwner?: boolean;
  rotateToken?: boolean;
} = {}) {
  const events: string[] = [];
  const session = options.session === undefined ? null : options.session;
  const original = {
    id, donorId: "owner", accessToken: bearer, status: "PAID", amount: 25,
    paymentMethod: "CARD", subscriptionId: null, subscription: null, items: [],
    categoryItems: [], waqfItems: [],
    providerRaw: { raw: "PRIVATE_GATEWAY" }, cardDetails: { cvv: "PRIVATE_CVV" },
  };
  const prisma = {
    donation: {
      findUnique: async (args: Row) => {
        if (args.select) {
          events.push("access");
          const fields = args.select as Row;
          assert.deepEqual(Object.keys(fields).sort(), ["accessToken", "donorId"]);
          return options.missing ? null : { donorId: original.donorId, accessToken: original.accessToken };
        }
        events.push("details");
        const row = {
          ...original,
          donorId: options.rotateOwner ? "new-owner" : original.donorId,
          accessToken: options.rotateToken ? rotatedBearer : original.accessToken,
        };
        const omit = args.omit as Record<string, boolean>;
        return Object.fromEntries(Object.entries(row).filter(([key]) => !omit[key]));
      },
    },
  };
  const loaded = { exports: {} as Row };
  const dependencies: Row = {
    "next/server": { NextResponse: { json: (body: unknown, opt: Row = {}) => ({
      body: body as Row, status: (opt.status as number) ?? 200, headers: opt.headers as Row | undefined,
    }) } },
    "next-auth": { getServerSession: async () => session },
    "../../auth/[...nextauth]/options": {},
    "@/lib/prisma": { prisma },
    "@/lib/dashboard/permissions": {
      userHasDashboardPermission: (user: Row, permission: string) =>
        user.role === "ADMIN" || (user.role === "STAFF" && permission === "revenue"),
    },
    "@/lib/dashboard/api-auth": { isRevenueDashboardUser: (value: Row | null) =>
      value?.user && (value.user as Row).role === "ADMIN" },
    "@/lib/dashboard/donation-list-privacy": { donationListSafeFields },
    "@/lib/donations/access-token": { DONATION_TOKEN_PARAM, donationTokenMatches },
    "@/lib/donations/reconcile-stripe-donation": {
      reconcileStripeDonation: async () => { events.push("stripe"); },
    },
    "@/lib/donations/paypal-donation": {
      reconcilePayPalDonation: async () => { events.push("paypal"); },
    },
  };
  const code = ts.transpileModule(readFileSync("app/api/donations/[id]/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(code).runInNewContext({
    module: loaded, exports: loaded.exports, Date, Map, Set, URL,
    console: { error() {} },
    require: (key: string) => dependencies[key] ?? {},
  });
  const get = async (suppliedId: string, token?: string) => {
    const url = new URL("https://fixture.invalid/api/donations/" + suppliedId);
    if (token) url.searchParams.set("t", token);
    return (loaded.exports.GET as (request: { nextUrl: URL }, context: { params: Promise<{ id: string }> }) => Promise<{
      body: Row; status: number; headers?: Row;
    }>)({ nextUrl: url }, { params: Promise.resolve({ id: suppliedId }) });
  };
  return { get, events };
}

test("invalid donation IDs are rejected before even a database lookup or gateway call", async () => {
  const h = harness();
  for (const value of ["", "../other", "not-a-mongo-id", "z".repeat(24)]) {
    const response = await h.get(value);
    assert.equal(response.status, 400);
  }
  assert.deepEqual(h.events, []);
});

test("unknown donation returns 404 without provider reconciliation", async () => {
  const h = harness({ missing: true });
  assert.equal((await h.get(id)).status, 404);
  assert.deepEqual(h.events, ["access"]);
});

test("anonymous or signed-in non-owner cannot invoke Stripe or PayPal or load details by ID", async () => {
  for (const session of [null, { user: { id: "other", role: "DONOR" } }]) {
    const h = harness({ session });
    for (const token of [undefined, "not-a-token"]) {
      assert.equal((await h.get(id, token)).status, 403);
    }
    assert.deepEqual(h.events, ["access", "access"]);
  }
});

test("valid guest bearer can reconcile and view own donation without leaking receipt token", async () => {
  const h = harness();
  const response = await h.get(id, bearer);
  assert.equal(response.status, 200);
  assert.deepEqual(h.events, ["access", "stripe", "details"]);
  assert.equal(response.body.id, id);
  assert.equal(response.body.accessToken, undefined);
  assert.equal(response.body.providerRaw, undefined);
  assert.equal(response.body.cardDetails, undefined);
  assert.equal(response.headers?.["Cache-Control"], "private, no-store");
});

test("owner can reconcile by session; revenue administrator invokes PayPal only after authorization", async () => {
  const owner = harness({ session: { user: { id: "owner", role: "DONOR" } } });
  assert.equal((await owner.get(id)).status, 200);
  assert.deepEqual(owner.events, ["access", "stripe", "details"]);

  const admin = harness({ session: { user: { id: "staff", role: "ADMIN" } } });
  assert.equal((await admin.get(id)).status, 200);
  assert.deepEqual(admin.events, ["access", "stripe", "paypal", "details"]);
});

test("rotated bearer or reassigned donor during reconciliation cannot use stale authorization to read details", async () => {
  const moved = harness({ session: { user: { id: "owner", role: "DONOR" } }, rotateOwner: true });
  assert.equal((await moved.get(id)).status, 403);
  assert.deepEqual(moved.events, ["access", "stripe", "details"]);
  const tokenRotated = harness({ rotateToken: true });
  assert.equal((await tokenRotated.get(id, bearer)).status, 403);
  assert.deepEqual(tokenRotated.events, ["access", "stripe", "details"]);
});
