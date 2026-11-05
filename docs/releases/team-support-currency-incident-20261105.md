# Team support currency incident — 2026-11-05

## Deployment checkpoint

The supplied production release log confirms commit `2f73652212f338da2781ebb801aaeafc0799d241` completed successfully at 2026-11-05 10:18:52 UTC (13:18 Istanbul), with runtime activated. This is the previous release, not deployment evidence for this fix.

## Confirmed reproduction

On the Turkish production project/cart flow, with TRY selected, adding a 2,500 TRY project and typing 500 in custom team support displayed 25,031 TRY support and 27,531 TRY total. Checkout omitted the order total. No payment was submitted. The initially empty test basket was emptied after the reproduction.

The custom field stored a local-currency number as canonical USD. The cart and server then converted it again. The donor's particular transaction and any refund have not been verified by this investigation.

## Changes

- Convert custom support to canonical USD once and retain its exact entered amount/currency, matching project-line handling.
- Respect administrator per-currency support presets.
- Version support storage and failed-attempt recovery. Discard ambiguous legacy positive support numbers; donors can reselect the optional amount.
- Render project amounts, support and final total immediately before payment confirmation; prevent submission until currency pricing is ready.
- Server uses exact tagged support in the matching charge currency and rejects a client/server total mismatch before creating payment orders or plans.
- Retain independent one-time/daily/Friday/monthly allocations and recurring support choices.

## Verification

38 focused tests passed, covering the actual custom-input handler, storage/recovery, mixed schedules, exact TRY support, malformed amounts, mismatched totals, payment handoff and verification feedback. Changed-file unused-variable, explicit-any, Next module-variable and React hooks lint: zero errors. A full production build and post-deployment browser check remain release checks.

## Clarity: last four days

Scope is the live four-day dashboard plus targeted Turkish checkout recordings, not exhaustive viewing of 3,611 recordings. Inputs are masked and the reporting donor's session cannot be established from the message alone.

| Signal | Observed |
| --- | --- |
| Sessions | 3,611; 1,038 bot sessions excluded |
| Dead clicks | 228 sessions, 6.31% |
| Quick backs | 158 sessions, 4.38% |
| Rage clicks | 4 sessions, 0.11% |
| Performance score | 64/100 across 990 page views |
| LCP / INP / CLS | 4.5 seconds / 420 ms / 0.30 |
| JavaScript errors | 156 errors; 3.68% of sessions |

Confirmed additional findings:

1. One reviewed Turkish journey repeatedly clicked the cart project title/amount, with a rage-click signal, then moved between cart, recurring donation and checkout. The exact expectation and entered amounts cannot be recovered from masking.
2. The Clarity smart event named Checkout appears on both cart and checkout visits. The counts (Checkout 630, Begin checkout 207, Submit form 154, Order success 87) are not a reconciled payment funnel and cannot establish a bank decline rate.
3. Incoming campaign URLs include literal unresolved `{{device_platform}}` and `{{publisher_platform}}` macros. These need correction at the campaign/link source.
4. One reviewed successful Turkish journey took approximately 38 seconds from Submit form to success and displayed 501 TRY. It does not identify the reported 27k transaction. Server/gateway traces are needed to attribute the delay.

Investigation backlog, not resolved by this currency patch:

- Diagnose page-specific LCP, interaction latency and layout shifts, especially mobile/in-app browsers.
- Correlate dead clicks and quick backs by page and control before redesigning them.
- Attribute JavaScript errors by stack/source. The dominant message is `error invoking postmessage: java object is gone` (82.69%); additional messages include script errors, denied sessionStorage, missing WebKit message handlers and read-only property writes. Do not assume all are first-party application errors.
- Reconcile payment events against server donation statuses and unique attempts; define a single checkout funnel.
- Locate the reporting donor's actual charge from transaction details and investigate its financial resolution separately.
