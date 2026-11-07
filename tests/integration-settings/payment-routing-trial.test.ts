import test from "node:test";
import assert from "node:assert/strict";
import { decideNewCardRoute, frozenPaymentRoute, routingPhoneCountry } from "../../lib/donations/payment-routing";
import { campaignLocalTime, campaignScheduleInstant } from "../../lib/communication/campaign-schedule";
import { safeAuthCallback } from "../../lib/auth-safe-callback";
import { saudiPayforReportPipeline } from "../../lib/donations/saudi-payfor-report";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { readFileSync } from "node:fs";
const base = { mainGateway: "ALBARAKA" as const, payforEnabled: true, saudiEnabled: true, currency: "USD", now: new Date("2026-10-31T00:00:00Z") };
for (const phone of ["+966501234567", "00966501234567", "+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧", "۰۰۹۶۶۵۰۱۲۳۴۵۶۷"]) test(`Saudi phone normalization: ${phone}`, () => {
 assert.equal(routingPhoneCountry(phone), "SA"); const route = decideNewCardRoute({ ...base, phone }); assert.equal(route.gateway, "PAYFOR"); assert.equal(route.reason, "SA_PHONE");
});
for (const [ipCountry, phone, reason] of [["SA", "+905551234567", "SA_IP"], ["TR", "+966501234567", "SA_PHONE"], ["SA", "+966501234567", "SA_IP_AND_PHONE"], [null, null, "DEFAULT"]] as const) test(`routing decision: ${reason}`, () => {
 const result = decideNewCardRoute({ ...base, ipCountry, phone }); assert.equal(result.reason, reason); assert.equal(result.gateway, reason === "DEFAULT" ? "ALBARAKA" : "PAYFOR"); assert.equal(result.changedGateway, reason !== "DEFAULT");
 assert.doesNotMatch(JSON.stringify(result), /501234567|5551234567/); assert.equal(frozenPaymentRoute({ paymentRouting: result })?.gateway, result.gateway);
});
test("disabled experiment and master switch, invalid phones and recurring cadences preserve their existing rails", () => {
 assert.equal(decideNewCardRoute({ ...base, saudiEnabled: false, ipCountry: "SA" }).gateway, "ALBARAKA");
 assert.equal(decideNewCardRoute({ ...base, payforEnabled: false, ipCountry: "SA", currency: "TRY" }).gateway, "ALBARAKA");
 for (const phone of ["+966", "00966", "+966000000000", "garbage", "+966501234567extra"]) assert.equal(routingPhoneCountry(phone), null);
 for (const donationType of ["DAILY", "FRIDAY", "MONTHLY"] as const) { const result = decideNewCardRoute({ ...base, ipCountry: "SA", donationType }); assert.equal(result.trialMatched, false); assert.equal(result.gateway, "ALBARAKA"); }
 assert.equal(decideNewCardRoute({ ...base, currency: "TRY", ipCountry: "SA" }).changedGateway, false);
 assert.equal(decideNewCardRoute({ ...base, currency: "DEFAULT" }).currency, "USD");
});
test("campaign schedule uses the displayed zone independently of the workstation clock and rejects gaps, invalid dates and past dates", () => {
 const now = new Date("2026-10-31T00:00:00Z");
 const next = campaignScheduleInstant("2027-01-02T09:00", "Europe/Istanbul", now)!;
 assert.equal(next.toISOString(), "2027-01-02T06:00:00.000Z"); assert.equal(campaignLocalTime(next), "2027-01-02T09:00");
 for (const input of ["bad", "2027-02-30T09:00", "2027-01-02T25:00", "2020-01-01T09:00"]) assert.equal(campaignScheduleInstant(input, "Europe/Istanbul", now), null);
 assert.equal(campaignScheduleInstant("2027-03-14T02:30", "America/New_York", now), null);
});
test("auth recovery rejects external destinations and auth loops while retaining a same-origin checkout locale", () => {
 for (const input of [undefined, "undefined", "javascript:alert(1)", "//evil.test/checkout", "https://evil.test", "/ar/auth/error", "/api/auth/signin", "/%61uth/error", "/\\evil.test", "/%5cevil.test"]) assert.equal(safeAuthCallback(input, "en"), "/en/checkout");
 assert.equal(safeAuthCallback("https://minberiaksa.org/tr/checkout?currency=TRY", "ar"), "/tr/checkout?currency=TRY");
 assert.equal(safeAuthCallback("/dashboard", "en"), "/dashboard");
 for (const locale of SUPPORTED_LOCALES) { const messages = JSON.parse(readFileSync(`i18n/messages/${locale}.json`, "utf8")); for (const key of ["authErrorTitle", "authAccessDenied", "authAccountConflict", "authUnavailable", "authUnknown", "donateAsGuest", "signInWithGoogle"]) assert.ok(messages.SignInDialog[key]?.trim(), `${locale}:${key}`); for (const key of ["bankChargeEstimate", "bankChargeCurrency", "paymentRoutingChanged"]) assert.ok(messages.DonationDialog[key]?.trim(), `${locale}:${key}`); }
});
test("trial reporting is restricted to new matching snapshots and requires settled payment evidence", () => {
 const pipeline = saudiPayforReportPipeline(base.now); const raw = JSON.stringify(pipeline);
 assert.match(raw, /paymentRouting.version/); assert.match(raw, /trialMatched/); assert.match(raw, /paidAt/); assert.match(raw, /unpricedPaid/); assert.match(raw, /changedGateway/);
 assert.equal(pipeline[0].$match?.createdAt.$gte.$date, base.now.toISOString());
});
