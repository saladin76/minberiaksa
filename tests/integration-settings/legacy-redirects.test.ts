import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_REDIRECTS } from "../../lib/seo/legacy-redirects";
const src = (s: string) => LEGACY_REDIRECTS.find((r) => r.source.includes(s));
test("old links redirect permanently, specific ones before the /bagis catch-all; Arabic monthly-donate untouched", () => {
  assert.ok(LEGACY_REDIRECTS.every((r) => r.permanent === true));
  assert.equal(src("hot-meals-campaign")?.destination, "/:locale/bagislar/gaza-hot-meals");
  assert.equal(src("bagis/ar/zakat")?.destination, "/:locale/pay-zakat-to-palestine");
  const mono = src("monthly-donate")!; assert.doesNotMatch(mono.source, /\bar\b/, "Arabic keeps its own monthly-donate page");
  const catchAll = LEGACY_REDIRECTS.findIndex((r) => r.source.endsWith("/bagis/:path*"));
  assert.equal(catchAll, LEGACY_REDIRECTS.length - 1, "catch-all last");
  assert.ok(LEGACY_REDIRECTS.slice(0, catchAll).some((r) => r.source.includes("bagis/proje/zekat")));
  assert.ok(LEGACY_REDIRECTS.every((r) => !/\/(bagislar|recurring-donation|pay-zakat-to-palestine)$/.test(r.source)), "no live page is redirected");
});
