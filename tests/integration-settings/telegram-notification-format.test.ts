import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatDonationNotification, type FormattableDonation } from "../../lib/telegram/format";

test("Telegram donation notification includes the timestamp promised by its dashboard description", () => {
  const dashboard = readFileSync("app/(dashboard)/dashboard/telegram/page.tsx", "utf8");
  const donation: FormattableDonation = {
    id: "donation-1",
    amount: 25,
    amountUSD: 25,
    currency: "USD",
    totalAmount: 25,
    teamSupport: 0,
    fees: 0,
    status: "PAID",
    paidAt: "2026-10-24T12:00:00.000Z",
    createdAt: "2026-10-24T11:55:00.000Z",
    subscriptionId: null,
    provider: "STRIPE",
    providerOrderId: null,
    providerErrorMessage: null,
    paymentMethod: "CARD",
    donorCountryCode: "TR",
    attribution: null,
    donor: { name: "Supporter", email: "supporter@example.org", phone: "+90 555 111 2233" },
    items: [],
    categoryItems: [],
    referral: null,
  };
  const message = formatDonationNotification(donation);

  assert.match(message, /🕒 <b>الوقت:<\/b>.+TR/);
  assert.match(message, /Supporter/);
  assert.match(message, /wa\.me\/905551112233/);
  assert.doesNotMatch(message, /supporter@example\.org/);
  assert.match(dashboard, /الحالة والمبلغ والعملة، ووقت التبرع/);
});
