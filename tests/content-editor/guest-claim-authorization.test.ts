import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { donationTokenMatches } from "../../lib/donations/access-token";

type Row = Record<string, unknown>;
const id = "a".repeat(24), bearer = "b".repeat(48);

function harness(options: {
  sessionId?: string | null;
  actualDonor?: string;
  missing?: boolean;
  guestEligible?: boolean;
} = {}) {
  const reads: Row[] = [], merges: Array<[string, string]> = [];
  const sessionId = options.sessionId === undefined ? "new-owner" : options.sessionId;
  const loaded = { exports: {} as Row };
  const deps: Row = {
    "next/server": {
      NextResponse: {
        json: (body: Row, init: { status?: number } = {}) =>
          ({ body, status: init.status ?? 200 }),
      },
    },
    "next-auth": {
      getServerSession: async () =>
        sessionId ? { user: { id: sessionId, role: "DONOR" } } : null,
    },
    "@/lib/prisma": {
      prisma: {
        donation: {
          findUnique: async (query: Row) => {
            reads.push(query);
            if (options.missing) return null;
            return { donorId: options.actualDonor ?? "anonymous-guest", accessToken: bearer };
          },
        },
      },
    },
    "@/lib/donations/access-token": { donationTokenMatches },
    "@/lib/users/link-guest": {
      linkGuestUserToTarget: async (guest: string, target: string) => {
        merges.push([guest, target]);
        return options.guestEligible === false
          ? { ok: false, reason: "GUEST_NOT_ELIGIBLE" }
          : { ok: true, movedDonations: 2 };
      },
    },
  };
  const code = ts.transpileModule(readFileSync("app/api/users/link-guest/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(code).runInNewContext({
    module: loaded, exports: loaded.exports,
    console: { error() {} },
    require: (name: string) => deps[name] ?? {},
  });
  const post = async (body: unknown) =>
    (loaded.exports.POST as (req: { json: () => Promise<unknown> }) =>
      Promise<{ status: number; body: Row }> )({ json: async () => body });
  return { post, reads, merges };
}

test("guest claim rejects unauthenticated users before any DB reads", async () => {
  const h = harness({ sessionId: null });
  assert.equal((await h.post({ donationId: id, accessToken: bearer })).status, 401);
  assert.equal(h.reads.length, 0);
  assert.equal(h.merges.length, 0);
});

test("guest claim refuses malformed IDs and missing records without moving donor history", async () => {
  const h = harness();
  for (const invalid of [undefined, null, "", "known-donation", "z".repeat(24), ["id"]]) {
    assert.equal((await h.post({ donationId: invalid, accessToken: bearer })).status, 400);
  }
  assert.equal(h.reads.length, 0);
  assert.equal(h.merges.length, 0);
  const missing = harness({ missing: true });
  assert.equal((await missing.post({ donationId: id, accessToken: bearer })).status, 404);
  assert.equal(missing.reads.length, 1);
  assert.equal(missing.merges.length, 0);
});

test("known donation IDs or wrong receipt tokens cannot claim another guest's history", async () => {
  const h = harness();
  for (const payload of [
    { donationId: id },
    { donationId: id, accessToken: "" },
    { donationId: id, accessToken: "wrong" },
    { donationId: id, accessToken: "c".repeat(48) },
  ]) {
    assert.equal((await h.post(payload)).status, 403);
  }
  assert.equal(h.merges.length, 0);
  assert.equal(h.reads.length, 4);
  for (const query of h.reads) {
    assert.equal((query.select as Row).donorId, true);
    assert.equal((query.select as Row).accessToken, true);
  }
});

test("matching high-entropy guest receipt bearer is required to merge donor history", async () => {
  const h = harness();
  const result = await h.post({ donationId: id, accessToken: bearer });
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.movedDonations, 2);
  assert.deepEqual(h.merges, [["anonymous-guest", "new-owner"]]);
});

test("already-owned donation returns idempotent success without a token or merge", async () => {
  const h = harness({ sessionId: "new-owner", actualDonor: "new-owner" });
  const result = await h.post({ donationId: id });
  assert.equal(result.status, 200);
  assert.equal(result.body.alreadyLinked, true);
  assert.equal(result.body.movedDonations, 0);
  assert.equal(h.merges.length, 0);
});

test("guest eligibility remains a separate defense even with a valid receipt token", async () => {
  const h = harness({ guestEligible: false });
  const result = await h.post({ donationId: id, accessToken: bearer });
  assert.equal(result.status, 409);
  assert.equal(h.merges.length, 1);
});

test("success page forwards its incoming guest receipt token when linking after login", () => {
  const source = readFileSync("components/minbar/success/SuccessPage.tsx", "utf8");
  assert.match(source, /fetch\("\/api\/users\/link-guest"/);
  assert.match(source, /JSON\.stringify\(\{\s*donationId: donation\.id,\s*accessToken: accessToken \?\? undefined\s*\}\)/);
  assert.match(source, /\[session\?\.user\?\.id,\s*donation\.id,\s*accessToken\]/);
});
