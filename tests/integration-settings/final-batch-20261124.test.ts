import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withLatn } from "../../lib/i18n/latn";
const read = (p: string) => fs.readFileSync(p, "utf8");
test("final batch (24 Nov): Latin digits, typed waqf count, dashboard fixes", () => {
  assert.doesNotMatch(new Intl.NumberFormat(withLatn("ar")).format(1208675), /[\u0660-\u0669\u06F0-\u06F9]/);
  assert.equal(withLatn("ar-EG-u-nu-latn"), "ar-EG-u-nu-latn"); assert.equal(withLatn(undefined), undefined);
  assert.match(read("components/minbar/waqf/WaqfPage.tsx"), /<input data-waqf-count="" inputMode="numeric"/);
  assert.match(read("app/(dashboard)/dashboard/users/_components/UsersManagement.tsx"), /summary=registered", \{ timeout: 45000 \}/);
  const home = read("app/(dashboard)/dashboard/page.tsx");
  assert.match(home, /: \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \};/); assert.doesNotMatch(home, /ChevronDown className="w-4 h-4 rotate-180"/);
  assert.match(read("app/(dashboard)/dashboard/general/payment-gateways/page.tsx"), /اختر واحدة فقط: البركة، أو Stripe، أو زراعات/);
});
