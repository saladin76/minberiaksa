import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { payForHash, verifyPayForRequestEcho } from "../../lib/payfor";

const PASS = "merchant-pass-fixture";
const ID = "6af674e2d1cd34cbb9de7d1a";
const echo = (over: Record<string, string> = {}) => {
  const f = { MbrId: "5", OrderId: ID, PurchAmount: "250.00", OkUrl: `https://minberiaksa.org/api/payfor/3dpay/ok?donationId=${ID}&locale=ar`,
    FailUrl: `https://minberiaksa.org/api/payfor/3dpay/fail?donationId=${ID}&locale=ar`, TxnType: "Auth", InstallmentCount: "0", Rnd: "1763460000000", ProcReturnCode: "V034", ...over };
  const Hash = payForHash({ mbrId: f.MbrId, orderId: f.OrderId, purchAmount: f.PurchAmount, okUrl: f.OkUrl, failUrl: f.FailUrl, txnType: f.TxnType, installmentCount: f.InstallmentCount, rnd: f.Rnd, merchantPass: PASS });
  return { ...f, Hash };
};

test("a 3D-stage failure echoing our own signed request is recognised as genuine", () => {
  assert.equal(verifyPayForRequestEcho(echo(), PASS), true);
});

test("a forged or altered echo is not: other order, other amount, no hash, wrong or missing password", () => {
  const g = echo();
  assert.equal(verifyPayForRequestEcho({ ...g, OrderId: "6af674e2d1cd34cbb9de7d1b" }, PASS), false, "replayed against another donation");
  assert.equal(verifyPayForRequestEcho({ ...g, PurchAmount: "1.00" }, PASS), false, "amount changed");
  const { Hash: _h, ...unsigned } = g; void _h;
  assert.equal(verifyPayForRequestEcho(unsigned, PASS), false, "no hash");
  assert.equal(verifyPayForRequestEcho(g, "wrong"), false);
  assert.equal(verifyPayForRequestEcho(g, undefined), false);
});

const read = (p: string) => fs.readFileSync(p, "utf8");
test("OK callback: genuineness is checked before ANY status change; approvals still need the bank's signature", () => {
  const s = read("app/api/payfor/3dpay/ok/route.ts");
  const gate = s.indexOf("if (!genuine) {"), firstFailed = s.indexOf('status: "FAILED"'), approvalCheck = s.indexOf("if (!verifyPayForResponseHash(raw, process.env.PAYFOR_MERCHANT_PASS)) {");
  assert.ok(gate > 0 && gate < firstFailed, "the gate precedes every FAILED write");
  assert.ok(approvalCheck > gate, "the approval-specific bank signature check is kept");
  assert.match(s, /orderId === donation\.id \|\| \(!!donation\.providerOrderId && orderId === donation\.providerOrderId\)/);
});

test("FAIL callback: only a genuine callback marks FAILED and messages the donor", () => {
  const s = read("app/api/payfor/3dpay/fail/route.ts");
  assert.match(s, /if \(donation && genuine && donation\.paidAt === null\) \{/);
  assert.ok(s.indexOf("const genuine") < s.indexOf('dispatchEvent("DONATION_FAILED"'));
});

test("browser-reported failure: the donor's token or session (or staff) is required, and every caller sends it", () => {
  const r = read("app/api/donations/[id]/fail/route.ts");
  assert.ok(r.indexOf("await authorizeDonationAccess(id, req)") > 0 && r.indexOf("await authorizeDonationAccess(id, req)") < r.indexOf("prisma.donation.findUnique"));
  for (const f of ["components/CartPaymentDialog.tsx", "components/DonationDialog.tsx"]) assert.match(read(f), /\.patch\(withDonationToken\(`\/api\/donations\/\$\{targetDonationId\}\/fail`, targetToken\)/, f);
  const checkout = read("lib/minbar/checkout.ts");
  assert.match(checkout, /token = resolveGuestDonationAccess\(donationId\)/);
  assert.match(checkout, /fetch\(`\/api\/donations\/\$\{donationId\}\/fail\$\{token \? `\?t=\$\{encodeURIComponent\(token\)\}` : ""\}`/);
  assert.doesNotMatch(checkout, /access-token-link/, "no new import: test sandboxes load checkout.ts with a fixed import list");
});
