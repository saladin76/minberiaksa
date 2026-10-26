# Donation notification totals

Automatic donation payment notifications now display the saved order total with a projects and team-support breakdown. Positive covered fees are shown separately. The total comes from the stored order, including historical orders whose component sum differs; rendering never recalculates a charge or fetches exchange rates.

The display adapter applies to donation-paid, donation-failed, first-donation and subscription-payment notifications. Without payment confirmation (`paidAt`), the wording identifies an attempted total whose collection is unconfirmed. Subscription signup/cancellation and marketing templates retain their existing semantics, so first-order support is not presented as a future recurring commitment.

Legacy amount slots are upgraded in readable email content, SMS and WhatsApp bodies. Links, button parameters and header values remain intact. Approved Meta templates keep the same identity and parameter count; expanded values are scoped to BODY parameters. Templates already using explicit breakdown fields retain their authored layout.

The template catalog exposes projects amount, team support, fees and a complete amount breakdown. Display labels cover all 19 supported languages. Existing scalar amount fields retain their meanings.

Retries of new automatic WhatsApp notifications use the archived breakdown. Older archives without it retain their historical values; this change does not replay messages or rewrite delivery history.

Validation uses mocked data and provider boundaries, including actual context loading, dispatch and retry paths, numeric/named Meta parameters, zero support, fees, invalid money, stored totals and confirmed/unconfirmed wording. No donor messages, payment provider calls or financial cron executions are required for these checks. Verify a new donor notification after deployment before considering production behavior confirmed.
