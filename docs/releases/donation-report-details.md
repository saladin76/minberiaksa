# Donation report detail and export language

The export dialog offers Arabic and English independently of the donor-language filter and dashboard cookie. A request-local AsyncLocalStorage context keeps simultaneous exports isolated. Existing country/language/project, external-spend, failed-attempt and transaction sheets remain. New Excel sheets show payment gateways, subscription overview, and country/cadence/provider/currency subscription analysis. The subscription roster includes provider, first-payment confirmation, lifetime totals, totals from exported donation results and missing-USD counts.

## Accounting definitions

- Paid means status PAID with a non-null paidAt. Failed or unconfirmed amounts are excluded from collected totals.
- Original currencies are separate. Historical charges in a different currency suppress the plan's combined local lifetime amount. USD totals use available stored values and disclose missing values.
- Confirmed active means ACTIVE with at least one lifetime confirmed payment. ACTIVE plans without a successful first payment appear separately and do not contribute to forecasts.
- Identified donors are distinct donor IDs, not plan counts. Missing donor IDs are reported separately. A donor may appear in several breakdown groups, so group donor counts must not be added together.
- Forecast is base donation only and uses the existing recurring-schedule monthly factors (365.25 / 12 for daily; 365.25 / 7 / 12 for Friday). It is not collected revenue; cancelled, paused, failed and unactivated plans are excluded.
- General donation reports include the current snapshot of plans referenced by exported donation rows. Recurring reports include the current snapshot of matching plans, including plans without payments. Their date range limits donation results; plan lifetime totals do not use that date range. New-plan counts use plan creation dates within the selected period and included plan population.
- Existing donation date filtering remains based on createdAt. Collected-in-report means successful payments within those exported results, not a separate paidAt-period ledger. The date basis, plan population and donation row limit are documented in report filters. General donation row limit is at most 50,000; recurring roster retains its existing 20,000 cap.
- Country on transaction analysis is the donation snapshot with donor-country fallback. Subscription analysis uses the current donor profile country. Provider is read from the plan, never inferred from email/phone/payment method.

## Verification

17 focused export tests pass. Coverage includes Arabic/English request isolation, full country names, English headings and notes, distinct donors/plans, daily/Friday/monthly plans, activation states, lifetime versus selected-result totals, original currencies, missing USD, provider loading, CSV escaping and preserved external-spend formulas. Strict TypeScript checking covers the exporter, report context, subscription loader and tests against generated Prisma types. Changed-file unused-variable/no-explicit-any lint passes.

This checkout is a partial source mirror. Full Next build, authenticated live export and production data reconciliation must run through the release job and subsequent production verification. No database writes, bank requests, real payments or donor messages are performed by this change.
