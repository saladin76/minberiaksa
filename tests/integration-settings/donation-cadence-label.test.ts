import assert from "node:assert/strict";
import test from "node:test";
import { donationCadenceLabel } from "../../lib/dashboard/donation-cadence-label";
import { setDashLocale } from "../../lib/dashboard/i18n";

for (const locale of ["ar", "en", "tr"] as const) {
  test(`${locale}: cadence uses the subscription frequency instead of legacy MONTHLY payment kind`, () => {
    setDashLocale(locale);
    const labels = {
      ar: ["يومي", "أسبوعياً", "شهري", "مرة واحدة", "تبرع دوري"],
      en: ["Daily", "Weekly", "Monthly", "One-time", "Recurring donation"],
      tr: ["Günlük", "Haftalık", "Aylık", "Tek seferlik", "Düzenli bağış"],
    }[locale];
    try {
      for (const [index, frequency] of ["DAILY", "FRIDAY", "MONTHLY"].entries()) {
        assert.equal(donationCadenceLabel({ type: "MONTHLY", frequency }), labels[index]);
      }
      assert.equal(donationCadenceLabel({ type: "ONE_TIME" }), labels[3]);
      assert.equal(donationCadenceLabel({ type: "MONTHLY" }), labels[4]);
      assert.equal(donationCadenceLabel({ type: "MONTHLY", frequency: "UNKNOWN" }), labels[4]);
    } finally { setDashLocale("ar"); }
  });
}
