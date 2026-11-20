import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync("app/api/paypal/return/route.ts", "utf8");
const catchBlock = s.slice(s.indexOf("} catch (error) {"), s.indexOf("async function settledOutcome"));
const helper = s.slice(s.indexOf("async function settledOutcome"));
test("after an error, a paid donation goes to the success page, a settling one to payment-processing", () => {
  assert.match(catchBlock, /if \(after\?\.paid\) return NextResponse\.redirect\(new URL\(withDonationToken\(`\/\$\{locale\}\/success\/\$\{donationId\}`/);
  assert.match(catchBlock, /payment-processing\?donationId=/);
  assert.match(catchBlock, /return NextResponse\.redirect\(failed, 303\);/, "otherwise still the failure page");
});
test("the fallback only reads: no capture, no write; a FAILED donation stays failed", () => {
  assert.doesNotMatch(catchBlock + helper, /completePayPalReturn\(|\.update\(|\.create\(|\.capture\w*\(/);
  assert.match(helper, /if \(!row \|\| row\.status === "FAILED"\) return null;/);
  assert.match(catchBlock, /if \(orderId\) \{/, "only when PayPal sent the donor back with an order");
});
