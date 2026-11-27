import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("donor pages read the configured floor and exempt recurring and share gifts", () => {
  const hook = fs.readFileSync("hooks/useDonationAmount.ts", "utf8");
  assert.match(hook, /minDonationFor\(code, rate, minCfg\)/);
  assert.match(hook, /if \(opts\?\.shares \|\| \(opts\?\.frequency && opts\.frequency !== "once"\)\) return false;/);
  assert.match(hook, /if \(\(row\.freqKey && row\.freqKey !== "once"\) \|\| row\.shareCount\) return false;/);
  assert.doesNotMatch(hook, /MIN_DONATION_USD/, "no fixed 1 USD left in the donor hook");
  assert.match(fs.readFileSync("components/minbar/projects/DonationPanel.tsx", "utf8"), /tooSmall\(amount, given\.local, \{ frequency: freq, shares: Boolean\(shares\) \}\)/);
  assert.match(fs.readFileSync("components/minbar/ProjectDonateCard.tsx", "utf8"), /if \(freq === "once" && belowMinimum\) \{/);
});

test("the dashboard shows the minimum as one card: a switch, then its figures", () => {
  const page = fs.readFileSync("app/(dashboard)/dashboard/general/payment-gateways/page.tsx", "utf8");
  assert.match(page, /checked=\{!allowAnyAmount\} disabled=\{savingAnyAmount\} onCheckedChange=\{\(on\) => handleToggleAnyAmount\(!on\)\}/);
  assert.doesNotMatch(page, /السماح بمبالغ أقل من دولار واحد/);
  assert.equal(page.match(/dt\("الحد الأدنى للتبرع"\)/g)?.length, 1);
});
