# Recurring scheduling and debit safety

The old closest-slot calculation could schedule another daily debit on the day a late retry succeeded, or a monthly renewal one day after signup. Checkout, settlement and internally billed workers now share an explicit period policy.

- Daily: at most one successful ordinary debit per local calendar day, including delayed retries. This is a calendar-day policy, not a minimum 24-hour interval; DST days can last 23/25 hours.
- Monthly first renewal: first chosen billing day/time on or after the calendar-month anniversary date of the confirmed first payment. October 31 with billing day 1 renews December 1. Month-end anniversaries clamp to shorter months. Later renewals keep the chosen day in the next local calendar month after successful payment.
- Friday: signup payment remains immediate; later ordinary debits and retries start only on Fridays in the plan timezone. A retry crossing into Saturday moves to the next Friday slot.
- Successful late collection covers its actual payment day/month. No catch-up loop charges all missed periods. Response time, rather than a stale batch-start clock, determines settlement day.
- Albaraka/PayPal workers check the latest confirmed ordinary ledger payments under the existing billing lease before creating an attempt. Missing proof, unresolved attempts or invalid metadata pause billing for review. Existing order idempotency remains. QA cycles are excluded and keep their separate explicit lock.
- Late Albaraka/PayPal success/failure cannot revive a donor-paused/cancelled plan. First-payment decline is PAYMENT_FAILED, not donor cancellation. A late failure cannot overwrite an already confirmed donation.

The exact first renewal date and localized policy appear before checkout submission in all 19 languages. New consent snapshots record billingPolicyVersion 2. Historical consent and transactions are not rewritten. Saudi routing, Albaraka 2D/3D selection, amounts, stored-card handling and bank recurring/mail-order flags are unchanged.

## Existing plan repair

Deploy the pinned full commit with the normal release-job.mjs start <SHA> --publish --activate-approved --wait flow. With Node 24 selected in /root/minberiaksa:

```bash
node --conditions=react-server --import tsx scripts/repair-recurring-schedule-safety.mjs
node --conditions=react-server --import tsx scripts/repair-recurring-schedule-safety.mjs --apply
node --conditions=react-server --import tsx scripts/repair-recurring-schedule-safety.mjs
```

Default is read-only. Apply only postpones an unsafe next date or pauses an unresolved active internally billed plan. It claims the existing lease, rechecks the ledger and conditionally updates, so concurrent cancellation/date edits win. It skips QA/repricing locks and active leases; never activates, moves dates earlier, captures, refunds, calls providers or sends recipient messages. A SYSTEM/TEAM audit records aggregate changes. Optional --details includes subscription IDs for private review; default output excludes donor identifiers.

Expect complete true, paymentCaptures/providerCalls/recipientMessages 0. A repeated audit should show no outstanding postponements/holds among available active plans. Busy plans require later recheck. Paused review cases require verifying the original bank order before resuming. Workers enforce the same boundary independently of this one-time repair.

No new real-bank tests are performed by this release, and issuer declines such as 05/82 are not resolved by scheduling changes. Existing Stripe billing/dunning is provider-managed; the shared first-renewal calculation applies to new checkout anchors, while this repair only touches Albaraka/PayPal. VPS activation and provider acceptance require separate production evidence.

Validation covers concurrency, stale plan pointers, late retries, October 31 signup, month ends/leap years, DST, Friday retries, unknown outcomes, cancelled/paused settlement, contradictory late responses, midnight during capture, keyset paging, dry-run, locks, conditional-update races and standalone imports. Browser fixtures inspect real checkout dates/terms for all three cadences in Arabic/English/Turkish at phone/desktop widths with synthetic HTTP and intercepted gateway navigation.
