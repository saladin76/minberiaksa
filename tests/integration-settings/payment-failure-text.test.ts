import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { paymentFailureText } from "../../lib/templates/donation-money";

test("donor messages explain a failure with the failure page's own texts, per language", () => {
  const book = (loc: string) => JSON.parse(fs.readFileSync(`i18n/messages/${loc}.json`, "utf8")).DonationFailed.errors;
  for (const loc of ["ar", "en", "tr"]) {
    const funds = paymentFailureText(loc, { providerProcReturnCode: "51" });
    assert.equal(funds.failureReason, book(loc).insufficientFunds.reason, loc);
    assert.equal(funds.failureFix, book(loc).insufficientFunds.fix ?? "", loc);
    assert.equal(paymentFailureText(loc, { providerProcReturnCode: "ZZ" }).failureReason, book(loc).generic.reason, `${loc} unknown code → generic`);
  }
  assert.ok(paymentFailureText("xx", { providerProcReturnCode: "51" }).failureReason, "an unknown language falls back to English");
});

test("only failed donations carry the failure fields", () => {
  const v = fs.readFileSync("lib/templates/variables.ts", "utf8");
  assert.match(v, /d\.status === "FAILED" && typeof paymentFailureText === "function" \? paymentFailureText\(locale \|\| d\.locale \|\| "ar", d\) : \{\}/);
  assert.match(fs.readFileSync("lib/templates/variable-catalog.ts", "utf8"), /\{\{donation\.failureReason\}\}/);
});
