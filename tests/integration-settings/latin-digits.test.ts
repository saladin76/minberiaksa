import test from "node:test";
import assert from "node:assert/strict";
import { withLatn } from "../../lib/i18n/latn";
test("Arabic numbers and dates use Latin digits; other locales unchanged", () => {
  const indic = /[\u0660-\u0669\u06F0-\u06F9]/;
  assert.doesNotMatch(new Intl.NumberFormat(withLatn("ar")).format(1208675), indic);
  assert.doesNotMatch(new Intl.DateTimeFormat(withLatn("ar"), { day: "numeric", month: "long", year: "numeric" }).format(new Date("2026-11-22")), indic);
  assert.equal(withLatn("en"), "en-u-nu-latn"); assert.equal(withLatn("ar-EG-u-nu-latn"), "ar-EG-u-nu-latn"); assert.equal(withLatn(undefined), undefined);
});
