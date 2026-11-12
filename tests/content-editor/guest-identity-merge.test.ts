import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Row = Record<string, unknown>;
type GuestFlags = {
  password?: string | null;
  oauth?: boolean;
  registeredAt?: Date | null;
  emailVerified?: Date | null;
  role?: string;
  identity?: boolean;
  session?: boolean;
  invitation?: boolean;
  mergedIntoUserId?: string | null;
};
function harness(flags: GuestFlags = {}) {
  const writes: string[] = [];
  const guest = {
    id: "guest", name: "Guest", phone: "+900000000000",
    password: flags.password ?? null, role: flags.role ?? "DONOR",
    accounts: flags.oauth ? [{ id: "oauth" }] : [],
    registeredAt: flags.registeredAt ?? null,
    emailVerified: flags.emailVerified ?? null,
    mergedIntoUserId: flags.mergedIntoUserId ?? null,
  };
  const target = { id: "target", name: "Recipient", email: "target@example.test", phone: null };
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "guest" ? guest : where.id === "target" ? target : null,
    },
    donorLoginIdentity: {
      findFirst: async () => flags.identity ? { id: "verified-otp" } : null,
    },
    session: {
      findFirst: async () => flags.session ? { id: "existing-session" } : null,
    },
    donorAccountInvitation: {
      findFirst: async () => flags.invitation ? { id: "account-invite" } : null,
    },
    $transaction: async (fn: (tx: Row) => Promise<unknown>) => fn({
      user: {
        update: async () => { writes.push("user-update"); },
        delete: async () => { writes.push("user-delete"); },
      },
      donation: { updateMany: async () => { writes.push("donation-move"); return { count: 2 }; } },
      subscription: { updateMany: async () => { writes.push("subscription-move"); return { count: 0 }; } },
      comment: { updateMany: async () => { writes.push("comment-move"); return { count: 0 }; } },
      cartItem: { updateMany: async () => { writes.push("cart-move"); return { count: 0 }; } },
      message: { updateMany: async () => { writes.push("message-move"); return { count: 0 }; } },
      creditCard: { updateMany: async () => { writes.push("card-move"); return { count: 0 }; } },
    }),
  };
  const mod = { exports: {} as Row };
  new vm.Script(ts.transpileModule(readFileSync("lib/users/link-guest.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText).runInNewContext({
    module: mod, exports: mod.exports,
    require: (key: string) => key === "@/lib/prisma" ? { prisma } : {},
  });
  return {
    merge: (guestId = "guest", targetId = "target") =>
      (mod.exports.linkGuestUserToTarget as (g: string, t: string) => Promise<Row>)(guestId, targetId),
    writes,
  };
}

test("verified passwordless OTP identity is never a guest merge target", async () => {
  const h = harness({ identity: true });
  const result = await h.merge();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "GUEST_NOT_ELIGIBLE");
  assert.equal(h.writes.length, 0, "verified donor history must not move");
});

test("existing login session or admin invitation blocks guest takeover", async () => {
  for (const flags of [{ session: true }, { invitation: true }]) {
    const h = harness(flags);
    const result = await h.merge();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "GUEST_NOT_ELIGIBLE");
    assert.equal(h.writes.length, 0);
  }
});

test("registered or linked real accounts are not eligible even without a password", async () => {
  const registered = new Date("2026-11-10T08:00:00Z");
  for (const flags of [
    { registeredAt: registered }, { emailVerified: registered }, { oauth: true },
    { password: "hashed" }, { mergedIntoUserId: "other" }, { role: "STAFF" },
  ]) {
    const h = harness(flags);
    assert.equal((await h.merge()).reason, "GUEST_NOT_ELIGIBLE");
    assert.equal(h.writes.length, 0);
  }
});

test("genuinely anonymous guest account still merges after receipt-token route authorization", async () => {
  const h = harness();
  const result = await h.merge();
  assert.equal(result.ok, true);
  assert.equal(result.movedDonations, 2);
  assert.ok(h.writes.includes("donation-move"));
  assert.ok(h.writes.includes("user-delete"));
});

test("same-account guest claim is idempotent and performs no financial or profile writes", async () => {
  const h = harness();
  const result = await h.merge("target", "target");
  assert.equal(result.ok, true);
  assert.equal(result.alreadyLinked, true);
  assert.equal(h.writes.length, 0);
});
