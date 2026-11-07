import test from "node:test";
import assert from "node:assert/strict";
import { redirectLegacyPath } from "../../lib/minbar/slug-routing";

test("legacy Gaza campaign URLs redirect exactly to the Arabic project catalogue", () => {
  assert.equal(redirectLegacyPath("/ar/relief-in-gaza"), "/ar/bagislar");
  assert.equal(redirectLegacyPath("/ar/bagis/ar/project"), "/ar/bagislar");
  assert.equal(redirectLegacyPath("/ar/bagis/ar/project/94"), "/ar/bagislar");
  assert.equal(redirectLegacyPath("/ar/bagis/ar/project/94/"), "/ar/bagislar");
  assert.equal(redirectLegacyPath("/ar/bagis/ar/project/not-a-number"), null);
  assert.equal(redirectLegacyPath("/ar/relief-in-gaza/updates"), null);
});

test("unrelated locale routes are not captured by the campaign redirects", () => {
  assert.equal(redirectLegacyPath("/en/relief-in-gaza"), null);
  assert.equal(redirectLegacyPath("/tr/relief-in-gaza"), null);
});
