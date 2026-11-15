import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");
const routes = ["app/api/donations/route.ts", "app/api/cart/payment/route.ts"];

test("both card checkouts evaluate the guard before any donor or donation write, lazily and fail-open", () => {
  for (const p of routes) {
    const s = read(p), g = s.indexOf("checkDonationGuard(");
    assert.ok(g > 0, p + " calls the guard");
    for (const write of ["resolveGuestDonor(", ".donation.create(", ".subscription.create("]) {
      const w = s.indexOf(write, s.indexOf("export async function POST"));
      if (w > 0) assert.ok(g < w, `${p}: guard runs before ${write}`);
    }
    assert.match(s, /await import\("@\/lib\/site-security\/donation-guard"\)/, p + " loads the guard lazily");
    assert.match(s, /\.catch\(\(\) => \(\{ response: null, keys: null \}\)\)/, p + " is fail-open");
    assert.doesNotMatch(s, /^import .*donation-guard/m, p + " has no static guard import (sandboxed fixtures stay valid)");
    assert.match(s, /recordDonationGuardAttempt\(donationGuard,/, p + " records the attempt after creation");
  }
});

test("batch 1 observes only: enforcement is not available and the guard never returns a response", () => {
  const g = read("lib/site-security/donation-guard.ts");
  assert.match(g, /const ENFORCEMENT_AVAILABLE = false;/);
  assert.doesNotMatch(g, /NextResponse\.json/, "no blocking reply exists in batch 1");
  assert.match(g, /if \(ctx\.paymentMethod !== "CARD"/, "only card checkouts are evaluated");
  assert.match(g, /fail-open/);
});

test("only a verified PAID donation the browser may access issues the trusted-device mark", () => {
  const r = read("app/api/donation-guard/trust/route.ts");
  assert.match(r, /donationAccess\(id, token\)/);
  assert.match(r, /row\?\.status !== "PAID" \|\| !row\.paidAt/);
  assert.match(r, /httpOnly: true, secure: true/);
  assert.match(read("app/[locale]/success/[id]/page.tsx"), /<DonationTrustMark donationId=\{id\} token=\{token \?\? null\} \/>/);
});

test("the admin overview requires an admin session and exposes hashed keys only", () => {
  const a = read("app/api/admin/site-security/donation-guard/route.ts");
  assert.match(a, /requireAdminSession\(await getServerSession\(authOptions\)\)/);
  assert.doesNotMatch(a, /email|phone|client_ip/i);
});
