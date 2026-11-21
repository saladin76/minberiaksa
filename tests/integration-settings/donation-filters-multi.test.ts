import test from "node:test";
import assert from "node:assert/strict";
import { dashboardLocaleWhere, dashboardCountryWhere } from "../../lib/dashboard/donation-location-scope";
import { donationProviderWhere } from "../../lib/dashboard/donation-provider-filter";
import { donationSourceWhere } from "../../lib/dashboard/donation-source-filter";

test("one value gives exactly the condition it gave before", () => {
  assert.deepEqual(dashboardLocaleWhere("ar"), { locale: "ar" });
  assert.deepEqual(dashboardCountryWhere("tr"), { donorCountryCode: "TR" });
  assert.deepEqual(dashboardCountryWhere("__unset"), { OR: [{ donorCountryCode: null }, { donorCountryCode: "" }, { donorCountryCode: { isSet: false } }] });
  assert.deepEqual(donationProviderWhere("paypal"), { provider: "PAYPAL" });
  assert.deepEqual(donationSourceWhere("facebook"), { sourceChannel: "facebook" });
  for (const fn of [dashboardLocaleWhere, dashboardCountryWhere, donationProviderWhere, donationSourceWhere]) { assert.equal(fn("all"), null); assert.equal(fn(""), null); assert.equal(fn(null), null); }
});
test("several values mean any of them", () => {
  assert.deepEqual(dashboardCountryWhere("TR,AZ"), { OR: [{ donorCountryCode: "TR" }, { donorCountryCode: "AZ" }] });
  assert.deepEqual(dashboardLocaleWhere("ar,tr"), { OR: [{ locale: "ar" }, { locale: "tr" }] });
  assert.deepEqual(donationProviderWhere("PAYPAL,STRIPE"), { OR: [{ provider: "PAYPAL" }, { provider: "STRIPE" }] });
  assert.deepEqual(donationSourceWhere("facebook,instagram"), { OR: [{ sourceChannel: "facebook" }, { sourceChannel: "instagram" }] });
  assert.deepEqual(donationSourceWhere("facebook,bogus"), { sourceChannel: "facebook" }, "unknown values are ignored, as before");
  assert.deepEqual(dashboardCountryWhere("TR,TR"), { donorCountryCode: "TR" }, "duplicates collapse");
});
