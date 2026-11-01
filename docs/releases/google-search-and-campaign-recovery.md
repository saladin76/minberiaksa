# Campaign revenue and Google Search recovery

Campaigns now have separate delivery and revenue views, including mobile cards. The revenue view uses the existing settled-payment ledger: `PAID` with `paidAt`, exact campaign IDs or proven unique historical aliases, and saved USD conversion values. Failed or pending attempts do not become revenue. A shared historical link is not enough to assign income to one campaign. Missing exchange values remain visible and excluded from the monetary total. Existing amounts measure the donation allocation, with the existing project/support accounting rules unchanged.

Email and SMS public donation links receive exact IDs during actual send and retry. An approved WhatsApp dynamic button receives the campaign ID without altering its approved static prefix or body parameters. The revenue view opens the existing template editor to prepare a separately tracked copy across its languages. Saving/submitting and Meta language approval remain explicit operations; no sent campaign is reset or replayed by opening the editor. Links copied from the revenue view open the public donation catalogue; visitors can choose their own language.

Attribution uses the most recent campaign touch retained for 30 days. A new campaign clears the preceding campaign identity; internal navigation, currency selection and payment returns preserve it. The sanitized snapshot is stored when checkout creates the donation. Search revenue uses exact `gs-{planId}` and account-timezone settlement dates in an indexed Mongo aggregation, without a lifetime 100,000-row cap.

## Google Search requirements

- Enabled conversion actions are required at automation activation and on each review cycle. Disabling automation requires no old thresholds or provider credentials.
- Keyword decisions use the account calendar from ten through three days ago, exclude unproven/young keywords, include enabled zero-impression keywords in the group count, retain at least three, and pause at most five per cycle. An empty group is reported separately.
- Every actual cycle is retained in cumulative history. Restoration touches only recorded automatic pauses, uses validation before mutation, and verifies the result. Unknown outcomes reconcile before replay.
- Planning, executor and optimizer share a ten-minute lease. Final writes compare revision, status and lease. Emergency pause disables local automation first and bypasses the lease and stale UI revision. A pause overtaking a live mutation remains unconfirmed and is checked again by the durable cron; late creation responses retain actual IDs.
- Zero-result uncertain creation returns to VALIDATED. Partial creation supports explicit adoption or validated removal. Saved resource IDs survive campaign renames; budget adoption shows the fresh provider amount and requires approval. Detachment first verifies pausing; draft archival requires no Google mutation.
- Language weights sum to 100%; integer micros and rounding remainders preserve the approved total. Optional country splits reuse one AI draft per language. Resource assignments use language/country keys. Account-wide 28-day conversions and enabled tracking select Maximize Conversions at 15+ conversions, otherwise CPC-capped Maximize Clicks (`targetSpend` in the API). Stored USD-base FX determines the minimum campaign budget; missing FX fails visibly before creation.
- AI readiness precedes account research. A single top-50 research summary is reused by language steps; invalid JSON has its own diagnostic. Cron output includes duration and per-plan failure counts, and independent failures do not stop sibling plans.

## Recurring notifications

Renewal rows explicitly record `billingReason=subscription_cycle`. Failed notification summaries identify a renewal in all 19 languages, preserve the unconfirmed attempted amount, and deduplicate short project titles without losing allocation lines. Legacy `RecurringSale` rows receive the same classification. An expired card leaves a repairable PAYMENT_FAILED plan and does not emit a false cancellation event. No issuer decline is overridden or converted to paid by these changes.

## Validation and remaining external acceptance

Automated fixtures cover campaign links → browser capture → sanitized checkout snapshot → settled reporting for email, SMS and WhatsApp; shared historical income; approval gates, partial creation, zero-resource reconciliation, renames, changed budgets, age/group floors, restoration, in-flight emergency races, and language/country budgets. Browser fixtures use real components in Arabic, English and Turkish at mobile and desktop widths, with no production/provider calls.

Before operational acceptance, repeat the full create-paused → enable → observe → pause cycle on a Google Ads test account. No live ad budget or bank payment is authorized by a passing fixture alone. Actual bank renewal approval, Meta language approval and recipient delivery remain provider evidence, not build results. The deployment does not send campaigns or retry the cited bank decline.
